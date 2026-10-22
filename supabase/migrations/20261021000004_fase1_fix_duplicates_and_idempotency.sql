-- =====================================================================
-- ZENDA - MIGRACIÓN 04: Limpieza de pagos duplicados e Idempotencia en RPC
-- 1. Eliminar pagos y movimientos duplicados de la sesión de hoy (2026-10-21)
-- 2. Restaurar saldos de las facturas afectadas
-- 3. Restaurar saldo acumulado en la caja correspondiente
-- 4. Actualizar create_payment con ventana de idempotencia (5 minutos)
-- =====================================================================

DO $$
BEGIN
  -- ===================================================================
  -- 1. Identificar duplicados de payments de hoy (mantener el primero)
  -- ===================================================================
  CREATE TEMP TABLE temp_payments_to_delete AS
  SELECT p.id, p.cash_movement_id, p.amount, p.invoice_id
  FROM public.payments p
  WHERE p.payment_date = '2026-10-21'
    AND p.id NOT IN (
      -- Mantener el id del primer pago registrado por factura hoy
      SELECT DISTINCT ON (invoice_id) id
      FROM public.payments
      WHERE payment_date = '2026-10-21'
      ORDER BY invoice_id, created_at ASC
    );

  -- ===================================================================
  -- 2. Desvincular cuotas que apunten a pagos a eliminar
  -- ===================================================================
  UPDATE public.cuotas
  SET payment_id = NULL
  WHERE payment_id IN (SELECT id FROM temp_payments_to_delete);

  -- ===================================================================
  -- 3. Desvincular FK cash_movement_id de payments a eliminar
  -- ===================================================================
  UPDATE public.payments
  SET cash_movement_id = NULL
  WHERE id IN (SELECT id FROM temp_payments_to_delete);

  -- ===================================================================
  -- 4. Eliminar los pagos duplicados
  -- ===================================================================
  DELETE FROM public.payments
  WHERE id IN (SELECT id FROM temp_payments_to_delete);

  -- ===================================================================
  -- 5. Eliminar los cash_movements duplicados huérfanos
  -- ===================================================================
  DELETE FROM public.cash_movements
  WHERE id IN (
    SELECT cash_movement_id FROM temp_payments_to_delete WHERE cash_movement_id IS NOT NULL
  );

  -- ===================================================================
  -- 6. Recalcular saldos de las facturas afectadas según payments reales
  -- ===================================================================
  UPDATE public.invoice i
  SET saldo = GREATEST(
    ROUND(
      i.amount - COALESCE(
        (SELECT SUM(p.amount) FROM public.payments p WHERE p.invoice_id = i.id),
        0
      ),
      2
    ),
    0
  ),
  status = CASE
    WHEN i.amount - COALESCE((SELECT SUM(p.amount) FROM public.payments p WHERE p.invoice_id = i.id), 0) <= 0 THEN 'pagado'
    ELSE 'pendiente'
  END
  WHERE i.id IN ('62d3b165-7034-415c-a309-25f3c5e1a25d', 'f8a0088a-7374-4811-a8a1-7b511a60bebd', '73be1e1f-0f2e-4724-b83f-3a468ea86fcc');

  -- ===================================================================
  -- 7. Recalcular saldo_final de las cajas según cash_movements reales
  -- ===================================================================
  UPDATE public.cajas c
  SET saldo_final = c.saldo_inicial + COALESCE((
    SELECT SUM(
      CASE
        WHEN m.tipo IN ('ingreso', 'pago') THEN m.monto
        WHEN m.tipo IN ('retiro', 'venta') THEN -m.monto
        ELSE m.monto
      END
    )
    FROM public.cash_movements m
    WHERE m.caja_id = c.id
  ), 0)
  WHERE c.estado = 'abierta';

  DROP TABLE temp_payments_to_delete;
END $$;

-- =====================================================================
-- 8. Actualizar create_payment con Idempotencia contra reintentos rápidos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_payment(
  p_invoice_id   uuid,
  p_client_id    uuid,
  p_amount       numeric,
  p_payment_date date,
  p_method       text,
  p_caja_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  -- ====================================================================
  -- IDEMPOTENCIA: si el mismo pago (misma factura, monto, método y fecha)
  -- ya fue registrado en los últimos 5 minutos, devolver el ID existente
  -- ====================================================================
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

  -- ====================================================================
  -- VALIDAR: monto >= 0
  -- ====================================================================
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor o igual a 0';
  END IF;

  -- ====================================================================
  -- OBTENER factura: saldo, estado y propietario
  -- ====================================================================
  SELECT saldo, status, usuario_id
  INTO v_saldo, v_status, v_usuario_id
  FROM public.invoice
  WHERE id = p_invoice_id;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'FACTURA_NOT_FOUND: factura % no existe', p_invoice_id;
  END IF;

  IF v_status = 'pagado' AND p_amount > 0 THEN
    RAISE EXCEPTION 'FACTURA_PAGADA: la factura % ya está completamente pagada', p_invoice_id;
  END IF;

  -- ====================================================================
  -- SEGURIDAD: el usuario autenticado debe ser el dueño o de la jerarquía
  -- ====================================================================
  IF v_usuario_id <> auth.uid() AND NOT public.is_same_hierarchy(v_usuario_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no tienes permiso para registrar pagos en esta factura';
  END IF;

  -- ====================================================================
  -- VALIDAR: monto no excede saldo (solo si > 0)
  -- ====================================================================
  IF p_amount > 0 AND p_amount > v_saldo THEN
    RAISE EXCEPTION 'El monto del pago (%) excede el saldo de la factura (%)', p_amount, v_saldo;
  END IF;

  -- ====================================================================
  -- VALIDAR: caja pertenece al usuario y está abierta (solo si > 0)
  -- ====================================================================
  IF p_amount > 0 THEN
    SELECT estado, usuario_id INTO v_caja_estado, v_caja_usuario_id
    FROM public.cajas WHERE id = p_caja_id;

    IF v_caja_usuario_id IS NULL THEN
      RAISE EXCEPTION 'CAJA_NOT_FOUND: caja % no existe', p_caja_id;
    END IF;

    IF v_caja_usuario_id <> auth.uid() THEN
      RAISE EXCEPTION 'CAJA_AJENA: la caja no pertenece al usuario autenticado';
    END IF;

    IF v_caja_estado <> 'abierta' THEN
      RAISE EXCEPTION 'CAJA_CERRADA: debes tener una caja abierta para registrar pagos';
    END IF;
  END IF;

  -- ====================================================================
  -- MOVIMIENTO DE CAJA (solo si amount > 0)
  -- ====================================================================
  IF p_amount > 0 THEN
    INSERT INTO public.cash_movements (caja_id, tipo, descripcion, monto)
    VALUES (
      p_caja_id,
      'pago',
      'Pago registrado - factura ' || p_invoice_id::text,
      ROUND(p_amount, 2)
    )
    RETURNING id INTO v_mov_id;

    -- Actualizar saldo de caja (pago ingresa dinero)
    UPDATE public.cajas
      SET saldo_final = COALESCE(saldo_final, 0) + ROUND(p_amount, 2)
      WHERE id = p_caja_id;
  END IF;

  -- ====================================================================
  -- INSERTAR PAGO
  -- ====================================================================
  INSERT INTO public.payments (
    invoice_id, client_id, amount, payment_date, method, cash_movement_id
  ) VALUES (
    p_invoice_id,
    p_client_id,
    ROUND(p_amount, 2),
    p_payment_date,
    p_method,
    v_mov_id
  )
  RETURNING id INTO v_pay_id;

  -- ====================================================================
  -- ACTUALIZAR SALDO DE FACTURA
  -- ====================================================================
  v_nuevo_saldo := GREATEST(ROUND(v_saldo - p_amount, 2), 0);

  UPDATE public.invoice
    SET
      saldo  = v_nuevo_saldo,
      status = CASE WHEN v_nuevo_saldo <= 0 THEN 'pagado' ELSE status END
    WHERE id = p_invoice_id;

  -- ====================================================================
  -- ACTUALIZAR CUOTA CORRESPONDIENTE (la más antigua pendiente)
  -- ====================================================================
  IF p_amount > 0 THEN
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
  END IF;

  RETURN v_pay_id;
END;
$$;
