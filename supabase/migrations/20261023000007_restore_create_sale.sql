-- =====================================================================
-- ZENDA - MIGRACIÓN: Restaurar create_sale único y limpio (13 parámetros)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.create_sale(
  nombre        text,
  apellido      text,
  alias         text,
  email         text,
  telefono      text,
  direccion     text,
  documento     text,
  monto         numeric, -- Capital solicitado
  vendedor_id   uuid,
  caja_id       uuid,
  plazo_id      integer,
  interes_id    integer,
  client_uuid   uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
#variable_conflict use_column
DECLARE
  v_client_id       uuid;
  v_invoice_id      uuid;
  v_mov_id          uuid;
  v_plazo_val       text;
  v_interes_val     text;
  v_tasa            numeric;
  v_capital         numeric;
  v_interes_monto   numeric;
  v_total_factura   numeric;
  v_num_cuotas      integer;
  v_cuota_monto     numeric;
  v_cuota_resto     numeric;
  v_caja_estado     text;
  v_vendedor_ok     boolean;
  i                 integer;
BEGIN
  -- Idempotencia: si client_uuid ya existe, retornar id existente
  IF create_sale.client_uuid IS NOT NULL THEN
    SELECT m.id, i.id INTO v_mov_id, v_invoice_id
    FROM public.cash_movements m
    JOIN public.invoice i ON m.descripcion LIKE '%' || i.id::text || '%'
    WHERE m.client_uuid = create_sale.client_uuid
    LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      RETURN json_build_object(
        'success', true,
        'id_factura', v_invoice_id,
        'id_movimiento', v_mov_id,
        'idempotente', true
      );
    END IF;
  END IF;

  -- Seguridad: verificar que el vendedor_id sea el autenticado o subordinado
  IF create_sale.vendedor_id <> auth.uid() THEN
    SELECT public.is_same_hierarchy(create_sale.vendedor_id) INTO v_vendedor_ok;
    IF NOT v_vendedor_ok THEN
      RAISE EXCEPTION 'UNAUTHORIZED: no tienes permiso para crear ventas en nombre de ese vendedor';
    END IF;
  END IF;

  -- Validar caja abierta
  SELECT cj.estado INTO v_caja_estado
  FROM public.cajas cj
  WHERE cj.id = create_sale.caja_id AND cj.usuario_id = create_sale.vendedor_id;

  IF v_caja_estado IS NULL THEN
    RAISE EXCEPTION 'CAJA_NOT_FOUND: caja no encontrada o no pertenece al vendedor';
  END IF;

  IF v_caja_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_CERRADA: debes abrir una caja antes de registrar una venta';
  END IF;

  -- Validar monto
  IF create_sale.monto IS NULL OR create_sale.monto <= 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO: el monto de la venta debe ser mayor que 0';
  END IF;

  -- Calculo de Capital e Interes
  SELECT cp.valor INTO v_interes_val
  FROM public.concepts cp WHERE cp.id = create_sale.interes_id;

  v_tasa := COALESCE(
    CASE 
      WHEN v_interes_val ~ '^\s*0\.' THEN (regexp_match(v_interes_val, '([0-9]+\.[0-9]+)'))[1]::numeric
      ELSE (regexp_match(v_interes_val, '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric / 100.0
    END,
    0
  );

  v_capital := ROUND(create_sale.monto, 2);
  v_interes_monto := ROUND(v_capital * v_tasa, 2);
  v_total_factura := v_capital + v_interes_monto;

  -- Cliente: buscar por documento del vendedor o crear nuevo
  SELECT cl.id INTO v_client_id
  FROM public.clients cl
  WHERE cl.documento = create_sale.documento
    AND cl.vendedor_id = create_sale.vendedor_id
  LIMIT 1;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (
      nombre, apellido, alias, email, telefono, direccion, documento, vendedor_id
    ) VALUES (
      create_sale.nombre,
      create_sale.apellido,
      create_sale.alias,
      create_sale.email,
      create_sale.telefono,
      create_sale.direccion,
      create_sale.documento,
      create_sale.vendedor_id
    )
    RETURNING clients.id INTO v_client_id;
  ELSE
    UPDATE public.clients AS cl SET
      nombre    = create_sale.nombre,
      apellido  = create_sale.apellido,
      alias     = create_sale.alias,
      email     = COALESCE(NULLIF(create_sale.email, ''), cl.email),
      telefono  = COALESCE(NULLIF(create_sale.telefono, ''), cl.telefono),
      direccion = COALESCE(NULLIF(create_sale.direccion, ''), cl.direccion)
    WHERE cl.id = v_client_id;
  END IF;

  -- Factura: amount y saldo representan el total a cobrar (Capital + Interes)
  INSERT INTO public.invoice (
    client_id, amount, saldo, status, usuario_id, plazo_id, interes_id,
    capital_amount, interest_amount
  ) VALUES (
    v_client_id,
    v_total_factura,
    v_total_factura,
    'pendiente',
    create_sale.vendedor_id,
    create_sale.plazo_id,
    create_sale.interes_id,
    v_capital,
    v_interes_monto
  )
  RETURNING invoice.id INTO v_invoice_id;

  -- Cuotas: calculadas sobre el total a cobrar
  SELECT cp.valor INTO v_plazo_val
  FROM public.concepts cp WHERE cp.id = create_sale.plazo_id;

  v_num_cuotas := COALESCE(
    (regexp_match(v_plazo_val, '(\d+)'))[1]::integer,
    1
  );
  IF v_num_cuotas <= 0 THEN v_num_cuotas := 1; END IF;

  v_cuota_monto := FLOOR(v_total_factura / v_num_cuotas);
  v_cuota_resto := v_total_factura - (v_cuota_monto * (v_num_cuotas - 1));

  FOR i IN 1..v_num_cuotas LOOP
    INSERT INTO public.cuotas (
      invoice_id, numero, fecha_vencimiento, monto, estado, monto_pagado
    ) VALUES (
      v_invoice_id,
      i,
      CURRENT_DATE + (i || ' days')::interval,
      CASE WHEN i = v_num_cuotas THEN v_cuota_resto ELSE v_cuota_monto END,
      'pendiente',
      0
    );
  END LOOP;

  -- Movimiento de Caja: tipo 'venta' (sale UNICAMENTE el Capital prestado)
  INSERT INTO public.cash_movements (
    caja_id, tipo, descripcion, monto, client_uuid
  ) VALUES (
    create_sale.caja_id,
    'venta',
    'Venta registrada - factura ' || v_invoice_id::text,
    v_capital,
    create_sale.client_uuid
  )
  RETURNING cash_movements.id INTO v_mov_id;

  -- Actualizar Saldo de Caja: resta el capital entregado en efectivo
  UPDATE public.cajas AS ca
    SET saldo_final = COALESCE(ca.saldo_final, 0) - v_capital
    WHERE ca.id = create_sale.caja_id;

  RETURN json_build_object(
    'success',        true,
    'id_factura',     v_invoice_id,
    'id_cliente',     v_client_id,
    'id_movimiento',  v_mov_id,
    'capital',        v_capital,
    'interes',        v_interes_monto,
    'total_factura',  v_total_factura,
    'es_cliente_nuevo', v_client_id IS NOT NULL
  );
END;
$func$;
