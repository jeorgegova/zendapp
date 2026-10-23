-- =====================================================================
-- ZENDA - MIGRACION 15: Implementacion Integral de la Logica Contable
-- Fase 2: Reglas financieras, Capital vs Interes, Renovaciones,
-- Transferencia Espejo, Cierre Atomico y Anulacion sin Pagos
-- =====================================================================

-- 1. Modificar tabla cash_movements para tipos completos y enlaces espejo
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS external_caja_id UUID REFERENCES public.cajas(id);
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS paired_movement_id UUID REFERENCES public.cash_movements(id);
ALTER TABLE public.cash_movements ADD COLUMN IF NOT EXISTS client_uuid UUID;

ALTER TABLE public.cash_movements DROP CONSTRAINT IF EXISTS cash_movements_tipo_check;
ALTER TABLE public.cash_movements ADD CONSTRAINT cash_movements_tipo_check 
  CHECK (tipo IN ('venta', 'renovacion', 'pago', 'nopago', 'gasto', 'ingreso', 'retiro'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_movements_client_uuid 
  ON public.cash_movements(client_uuid) WHERE client_uuid IS NOT NULL;

-- 2. Modificar tabla payments para idempotencia por client_uuid
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS client_uuid UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_client_uuid 
  ON public.payments(client_uuid) WHERE client_uuid IS NOT NULL;

-- 3. Modificar tabla invoice para trazabilidad de capital, interes y renovaciones
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS capital_amount NUMERIC(14,2);
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS interest_amount NUMERIC(14,2);
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS previous_invoice_id UUID REFERENCES public.invoice(id);

-- =====================================================================
-- 4. RPC: create_sale (Venta / Prestamo Nuevo con Capital vs Interes)
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

-- =====================================================================
-- 5. RPC: create_renewal (Renovacion de Credito con Liquidacion Previa)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_renewal(
  invoice_anterior_id uuid,
  nombre              text,
  apellido            text,
  alias               text,
  email               text,
  telefono            text,
  direccion           text,
  documento           text,
  monto               numeric, -- Nuevo Capital
  vendedor_id         uuid,
  caja_id             uuid,
  plazo_id            integer,
  interes_id          integer,
  client_uuid         uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
#variable_conflict use_column
DECLARE
  v_old_status      text;
  v_old_saldo       numeric;
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
  -- Idempotencia
  IF create_renewal.client_uuid IS NOT NULL THEN
    SELECT m.id, i.id INTO v_mov_id, v_invoice_id
    FROM public.cash_movements m
    JOIN public.invoice i ON m.descripcion LIKE '%' || i.id::text || '%'
    WHERE m.client_uuid = create_renewal.client_uuid
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

  -- Validar factura anterior
  SELECT status, saldo, client_id INTO v_old_status, v_old_saldo, v_client_id
  FROM public.invoice
  WHERE id = create_renewal.invoice_anterior_id
  FOR UPDATE;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'FACTURA_PREVIA_NOT_FOUND: factura anterior no existe';
  END IF;

  -- Validar caja abierta
  SELECT cj.estado INTO v_caja_estado
  FROM public.cajas cj
  WHERE cj.id = create_renewal.caja_id AND cj.usuario_id = create_renewal.vendedor_id;

  IF v_caja_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_CERRADA: debes tener una caja abierta para renovar';
  END IF;

  -- Liquidar factura anterior
  UPDATE public.invoice
  SET status = 'renovado', saldo = 0
  WHERE id = create_renewal.invoice_anterior_id;

  UPDATE public.cuotas
  SET estado = 'renovada'
  WHERE invoice_id = create_renewal.invoice_anterior_id AND estado IN ('pendiente', 'parcial');

  -- Calcular Capital e Interes de la nueva venta
  SELECT cp.valor INTO v_interes_val
  FROM public.concepts cp WHERE cp.id = create_renewal.interes_id;

  v_tasa := COALESCE(
    CASE 
      WHEN v_interes_val ~ '^\s*0\.' THEN (regexp_match(v_interes_val, '([0-9]+\.[0-9]+)'))[1]::numeric
      ELSE (regexp_match(v_interes_val, '([0-9]+(?:\.[0-9]+)?)'))[1]::numeric / 100.0
    END,
    0
  );

  v_capital := ROUND(create_renewal.monto, 2);
  v_interes_monto := ROUND(v_capital * v_tasa, 2);
  v_total_factura := v_capital + v_interes_monto;

  -- Crear nueva factura enlazada
  INSERT INTO public.invoice (
    client_id, amount, saldo, status, usuario_id, plazo_id, interes_id,
    capital_amount, interest_amount, previous_invoice_id
  ) VALUES (
    v_client_id,
    v_total_factura,
    v_total_factura,
    'pendiente',
    create_renewal.vendedor_id,
    create_renewal.plazo_id,
    create_renewal.interes_id,
    v_capital,
    v_interes_monto,
    create_renewal.invoice_anterior_id
  )
  RETURNING invoice.id INTO v_invoice_id;

  -- Generar cuotas
  SELECT cp.valor INTO v_plazo_val
  FROM public.concepts cp WHERE cp.id = create_renewal.plazo_id;

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

  -- Movimiento de Caja: tipo 'renovacion'
  INSERT INTO public.cash_movements (
    caja_id, tipo, descripcion, monto, client_uuid
  ) VALUES (
    create_renewal.caja_id,
    'renovacion',
    'Renovacion credito - nueva factura ' || v_invoice_id::text || ' (ant: ' || create_renewal.invoice_anterior_id::text || ')',
    v_capital,
    create_renewal.client_uuid
  )
  RETURNING cash_movements.id INTO v_mov_id;

  -- Descontar nuevo capital de la caja
  UPDATE public.cajas AS ca
    SET saldo_final = COALESCE(ca.saldo_final, 0) - v_capital
    WHERE ca.id = create_renewal.caja_id;

  RETURN json_build_object(
    'success',            true,
    'id_factura',         v_invoice_id,
    'id_factura_anterior', create_renewal.invoice_anterior_id,
    'id_movimiento',      v_mov_id,
    'capital',            v_capital,
    'total_factura',      v_total_factura
  );
END;
$func$;

-- =====================================================================
-- 6. RPC: create_payment (Soporte No-Pago, Cuotas e Idempotencia UUID)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_payment(
  p_invoice_id   uuid,
  p_client_id    uuid,
  p_amount       numeric,
  p_payment_date date,
  p_method       text,
  p_caja_id      uuid,
  p_client_uuid  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_saldo           numeric;
  v_status          text;
  v_usuario_id      uuid;
  v_caja_estado     text;
  v_caja_usuario_id uuid;
  v_mov_id          uuid;
  v_pay_id          uuid;
  v_nuevo_saldo     numeric;
BEGIN
  -- Idempotencia por client_uuid
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_pay_id
    FROM public.payments
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

    IF v_pay_id IS NOT NULL THEN
      RETURN v_pay_id;
    END IF;
  END IF;

  -- Idempotencia de ventana de 5 minutos (fallback si client_uuid es nulo)
  IF p_client_uuid IS NULL THEN
    SELECT id INTO v_pay_id
    FROM public.payments
    WHERE invoice_id = p_invoice_id
      AND amount = ROUND(p_amount, 2)
      AND method = p_method
      AND payment_date = p_payment_date
      AND created_at >= (now() - interval '5 minutes')
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pay_id IS NOT NULL THEN
      RETURN v_pay_id;
    END IF;
  END IF;

  -- Validacion de monto no negativo
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor o igual a 0';
  END IF;

  -- Factura
  SELECT saldo, status, usuario_id
  INTO v_saldo, v_status, v_usuario_id
  FROM public.invoice
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'FACTURA_NOT_FOUND: factura % no existe', p_invoice_id;
  END IF;

  -- CASO 1: NO PAGO (Visita sin cobro, amount = 0 o method = 'nopago')
  IF p_amount = 0 OR p_method = 'nopago' THEN
    INSERT INTO public.payments (
      invoice_id, client_id, amount, payment_date, method, client_uuid
    ) VALUES (
      p_invoice_id,
      p_client_id,
      0,
      p_payment_date,
      'nopago',
      p_client_uuid
    )
    RETURNING id INTO v_pay_id;

    IF p_caja_id IS NOT NULL THEN
      INSERT INTO public.cash_movements (caja_id, tipo, descripcion, monto, client_uuid)
      VALUES (
        p_caja_id,
        'nopago',
        'Visita sin cobro - factura ' || p_invoice_id::text,
        0,
        p_client_uuid
      );
    END IF;

    RETURN v_pay_id;
  END IF;

  -- CASO 2: ABONO / PAGO REAL (amount > 0)
  IF v_status = 'pagado' THEN
    RAISE EXCEPTION 'FACTURA_PAGADA: la factura % ya esta completamente pagada', p_invoice_id;
  END IF;

  IF p_amount > v_saldo THEN
    RAISE EXCEPTION 'El monto del pago (%) excede el saldo de la factura (%)', p_amount, v_saldo;
  END IF;

  -- Validar caja abierta
  SELECT estado, usuario_id INTO v_caja_estado, v_caja_usuario_id
  FROM public.cajas WHERE id = p_caja_id;

  IF v_caja_usuario_id IS NULL THEN
    RAISE EXCEPTION 'CAJA_NOT_FOUND: caja % no existe', p_caja_id;
  END IF;

  IF v_caja_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_CERRADA: debes tener una caja abierta para registrar pagos';
  END IF;

  -- Movimiento de caja: tipo 'pago'
  INSERT INTO public.cash_movements (caja_id, tipo, descripcion, monto, client_uuid)
  VALUES (
    p_caja_id,
    'pago',
    'Pago registrado - factura ' || p_invoice_id::text,
    ROUND(p_amount, 2),
    p_client_uuid
  )
  RETURNING id INTO v_mov_id;

  -- Sumar saldo a la caja
  UPDATE public.cajas
    SET saldo_final = COALESCE(saldo_final, 0) + ROUND(p_amount, 2)
    WHERE id = p_caja_id;

  -- Insertar pago
  INSERT INTO public.payments (
    invoice_id, client_id, amount, payment_date, method, cash_movement_id, client_uuid
  ) VALUES (
    p_invoice_id,
    p_client_id,
    ROUND(p_amount, 2),
    p_payment_date,
    p_method,
    v_mov_id,
    p_client_uuid
  )
  RETURNING id INTO v_pay_id;

  -- Descontar saldo de factura
  v_nuevo_saldo := GREATEST(ROUND(v_saldo - p_amount, 2), 0);

  UPDATE public.invoice
    SET
      saldo  = v_nuevo_saldo,
      status = CASE WHEN v_nuevo_saldo <= 0 THEN 'pagado' ELSE status END
    WHERE id = p_invoice_id;

  -- Actualizar cuota mas antigua pendiente
  UPDATE public.cuotas
    SET
      estado       = CASE WHEN monto <= p_amount THEN 'pagada' ELSE 'parcial' END,
      monto_pagado = LEAST(monto, ROUND(p_amount, 2)),
      payment_id   = v_pay_id
    WHERE id = (
      SELECT id FROM public.cuotas
      WHERE invoice_id = p_invoice_id
        AND estado IN ('pendiente', 'parcial')
      ORDER BY numero ASC
      LIMIT 1
    );

  RETURN v_pay_id;
END;
$func$;

-- =====================================================================
-- 7. RPC: rpc_cash_transfer (Transferencia Espejo Atomica entre Cajas)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_cash_transfer(
  p_source_caja_id uuid,
  p_dest_caja_id   uuid,
  p_monto          numeric,
  p_descripcion    text,
  p_client_uuid    uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_source_status text;
  v_dest_status   text;
  v_out_id        uuid;
  v_in_id         uuid;
BEGIN
  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0';
  END IF;

  IF p_source_caja_id = p_dest_caja_id THEN
    RAISE EXCEPTION 'No se puede transferir dinero a la misma caja';
  END IF;

  -- Idempotencia
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_out_id
    FROM public.cash_movements
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

    IF v_out_id IS NOT NULL THEN
      RETURN json_build_object('success', true, 'idempotente', true, 'retiro_id', v_out_id);
    END IF;
  END IF;

  -- Validar ambas cajas abiertas
  SELECT estado INTO v_source_status FROM public.cajas WHERE id = p_source_caja_id FOR UPDATE;
  SELECT estado INTO v_dest_status FROM public.cajas WHERE id = p_dest_caja_id FOR UPDATE;

  IF v_source_status IS NULL OR v_source_status <> 'abierta' THEN
    RAISE EXCEPTION 'La caja origen no existe o esta cerrada';
  END IF;

  IF v_dest_status IS NULL OR v_dest_status <> 'abierta' THEN
    RAISE EXCEPTION 'La caja destino no existe o esta cerrada';
  END IF;

  -- 1. Crear Retiro en Caja Origen
  INSERT INTO public.cash_movements (
    caja_id, tipo, descripcion, monto, external_caja_id, client_uuid
  ) VALUES (
    p_source_caja_id,
    'retiro',
    p_descripcion || ' (Transferencia enviada)',
    ROUND(p_monto, 2),
    p_dest_caja_id,
    p_client_uuid
  )
  RETURNING id INTO v_out_id;

  -- 2. Crear Ingreso en Caja Destino
  INSERT INTO public.cash_movements (
    caja_id, tipo, descripcion, monto, external_caja_id, paired_movement_id
  ) VALUES (
    p_dest_caja_id,
    'ingreso',
    p_descripcion || ' (Transferencia recibida)',
    ROUND(p_monto, 2),
    p_source_caja_id,
    v_out_id
  )
  RETURNING id INTO v_in_id;

  -- Enlazar par en el retiro
  UPDATE public.cash_movements SET paired_movement_id = v_in_id WHERE id = v_out_id;

  -- 3. Actualizar saldos atomicamente
  UPDATE public.cajas SET saldo_final = COALESCE(saldo_final, 0) - ROUND(p_monto, 2) WHERE id = p_source_caja_id;
  UPDATE public.cajas SET saldo_final = COALESCE(saldo_final, 0) + ROUND(p_monto, 2) WHERE id = p_dest_caja_id;

  RETURN json_build_object(
    'success',    true,
    'retiro_id',  v_out_id,
    'ingreso_id', v_in_id,
    'monto',      p_monto
  );
END;
$func$;

-- =====================================================================
-- 8. RPC: rpc_close_box (Cierre Atomico con Bloqueo si Subordinados Abiertos)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_close_box(
  p_caja_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_usuario_id            uuid;
  v_estado                text;
  v_saldo_inicial         numeric;
  v_subordinados_abiertos integer;
  v_mov_total             numeric;
  v_saldo_final_calc      numeric;
BEGIN
  -- Bloquear caja
  SELECT usuario_id, estado, COALESCE(saldo_inicial, 0)
  INTO v_usuario_id, v_estado, v_saldo_inicial
  FROM public.cajas
  WHERE id = p_caja_id
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'CAJA_NOT_FOUND: caja % no existe', p_caja_id;
  END IF;

  IF v_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_YA_CERRADA: la caja ya se encuentra cerrada';
  END IF;

  -- Regla jerarquica: no cerrar si algun subordinado directo tiene caja abierta
  SELECT COUNT(*) INTO v_subordinados_abiertos
  FROM public.cajas cb
  JOIN public.profiles p ON cb.usuario_id = p.id
  WHERE p.superior_id = v_usuario_id
    AND cb.estado = 'abierta';

  IF v_subordinados_abiertos > 0 THEN
    RAISE EXCEPTION 'NO_PUEDE_CERRAR: tienes % vendedor(es) subordinado(s) con caja abierta. Deben cerrar primero.', v_subordinados_abiertos;
  END IF;

  -- Calcular sumatoria exacta de movimientos
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('ingreso', 'pago') THEN monto
      WHEN tipo IN ('retiro', 'venta', 'renovacion', 'gasto') THEN -monto
      ELSE 0
    END
  ), 0)
  INTO v_mov_total
  FROM public.cash_movements
  WHERE caja_id = p_caja_id;

  v_saldo_final_calc := v_saldo_inicial + v_mov_total;

  -- Cerrar caja
  UPDATE public.cajas
  SET
    estado = 'cerrada',
    fecha_cierre = NOW(),
    saldo_final = v_saldo_final_calc
  WHERE id = p_caja_id;

  RETURN json_build_object(
    'success',       true,
    'caja_id',       p_caja_id,
    'saldo_inicial', v_saldo_inicial,
    'saldo_final',   v_saldo_final_calc,
    'movimientos',   v_mov_total
  );
END;
$func$;

-- =====================================================================
-- 9. RPC: rpc_cancel_sale (Anulacion de Venta Estricta sin Pagos)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_cancel_sale(
  p_invoice_id uuid,
  p_motivo     text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_status            text;
  v_usuario_id        uuid;
  v_capital           numeric;
  v_caja_id           uuid;
  v_caja_estado       text;
  v_pagos_count       integer;
BEGIN
  -- Bloquear factura
  SELECT status, usuario_id, capital_amount
  INTO v_status, v_usuario_id, v_capital
  FROM public.invoice
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'FACTURA_NOT_FOUND: factura % no existe', p_invoice_id;
  END IF;

  IF v_status = 'cancelada' THEN
    RAISE EXCEPTION 'FACTURA_YA_CANCELADA: la factura ya fue cancelada';
  END IF;

  -- Regla estricta: verificar que no tenga ningun abono o pago
  SELECT COUNT(*) INTO v_pagos_count
  FROM public.payments
  WHERE invoice_id = p_invoice_id AND amount > 0;

  IF v_pagos_count > 0 THEN
    RAISE EXCEPTION 'NO_SE_PUEDE_CANCELAR: la factura ya registra abonos o pagos';
  END IF;

  -- Obtener la caja del movimiento de venta original
  SELECT caja_id, monto INTO v_caja_id, v_capital
  FROM public.cash_movements
  WHERE tipo IN ('venta', 'renovacion')
    AND descripcion LIKE '%' || p_invoice_id::text || '%'
  ORDER BY fecha DESC
  LIMIT 1;

  -- Marcar factura y cuotas como canceladas
  UPDATE public.invoice
  SET status = 'cancelada', saldo = 0
  WHERE id = p_invoice_id;

  UPDATE public.cuotas
  SET estado = 'cancelada'
  WHERE invoice_id = p_invoice_id;

  -- Revertir el dinero a la caja si la caja existe y esta abierta
  IF v_caja_id IS NOT NULL THEN
    SELECT estado INTO v_caja_estado FROM public.cajas WHERE id = v_caja_id;
    IF v_caja_estado = 'abierta' THEN
      INSERT INTO public.cash_movements (caja_id, tipo, descripcion, monto)
      VALUES (
        v_caja_id,
        'ingreso',
        'Reintegro por anulacion venta - factura ' || p_invoice_id::text || COALESCE(' (' || p_motivo || ')', ''),
        COALESCE(v_capital, 0)
      );

      UPDATE public.cajas
      SET saldo_final = COALESCE(saldo_final, 0) + COALESCE(v_capital, 0)
      WHERE id = v_caja_id;
    END IF;
  END IF;

  RETURN json_build_object(
    'success',    true,
    'invoice_id', p_invoice_id,
    'capital_reintegrado', COALESCE(v_capital, 0)
  );
END;
$func$;

-- =====================================================================
-- 10. RPC: rpc_create_cash_movement (Atomico para Gastos, Ingresos, Retiros)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_cash_movement(
  p_caja_id     uuid,
  p_tipo        text,
  p_descripcion text,
  p_monto       numeric,
  p_client_uuid uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_caja_estado text;
  v_mov_id      uuid;
  v_delta       numeric;
BEGIN
  IF p_tipo NOT IN ('gasto', 'ingreso', 'retiro') THEN
    RAISE EXCEPTION 'TIPO_INVALIDO: el tipo debe ser gasto, ingreso o retiro';
  END IF;

  IF p_monto <= 0 THEN
    RAISE EXCEPTION 'MONTO_INVALIDO: el monto debe ser mayor a 0';
  END IF;

  -- Idempotencia
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_mov_id
    FROM public.cash_movements
    WHERE client_uuid = p_client_uuid
    LIMIT 1;

    IF v_mov_id IS NOT NULL THEN
      RETURN json_build_object('success', true, 'id', v_mov_id, 'idempotente', true);
    END IF;
  END IF;

  -- Validar caja abierta
  SELECT estado INTO v_caja_estado FROM public.cajas WHERE id = p_caja_id FOR UPDATE;

  IF v_caja_estado IS NULL OR v_caja_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_CERRADA: la caja debe estar abierta para registrar movimientos';
  END IF;

  -- Insertar movimiento
  INSERT INTO public.cash_movements (
    caja_id, tipo, descripcion, monto, client_uuid
  ) VALUES (
    p_caja_id,
    p_tipo,
    p_descripcion,
    ROUND(p_monto, 2),
    p_client_uuid
  )
  RETURNING id INTO v_mov_id;

  -- Actualizar saldo de caja de inmediato
  v_delta := CASE WHEN p_tipo = 'ingreso' THEN ROUND(p_monto, 2) ELSE -ROUND(p_monto, 2) END;

  UPDATE public.cajas
  SET saldo_final = COALESCE(saldo_final, 0) + v_delta
  WHERE id = p_caja_id;

  RETURN json_build_object(
    'success',  true,
    'id',       v_mov_id,
    'tipo',     p_tipo,
    'monto',    p_monto
  );
END;
$func$;
