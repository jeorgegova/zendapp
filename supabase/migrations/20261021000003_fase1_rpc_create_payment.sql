-- =====================================================================
-- ZENDA - MIGRACIÓN 03: Función RPC create_payment reforzada
-- Auditoría: la función ya existía y funciona correctamente en
-- términos transaccionales. Se refuerzan las validaciones de seguridad.
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
  -- VALIDAR: monto > 0 (nopago usa method='nopago' con amount=0)
  -- ====================================================================
  IF p_amount < 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor que 0';
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

  IF v_status = 'pagado' THEN
    RAISE EXCEPTION 'FACTURA_PAGADA: la factura % ya está completamente pagada', p_invoice_id;
  END IF;

  -- ====================================================================
  -- SEGURIDAD: el usuario autenticado debe ser el dueño de la factura
  -- o un admin con jerarquía sobre él
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
        estado      = CASE WHEN monto <= p_amount THEN 'pagada' ELSE 'parcial' END,
        monto_pagado = LEAST(monto, ROUND(p_amount, 2)),
        payment_id  = v_pay_id
      WHERE id = (
        SELECT id FROM public.cuotas
        WHERE invoice_id = p_invoice_id
          AND estado IN ('pendiente', 'parcial')
        ORDER BY numero ASC
        LIMIT 1
      );
  END IF;

  RETURN v_pay_id;

EXCEPTION
  WHEN OTHERS THEN
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_payment IS
  'Registra un pago de forma atómica: valida saldo, crea movimiento de caja, '
  'actualiza saldo de factura, marca cuota más antigua como pagada. '
  'Valida auth.uid() contra propietario de la factura y de la caja.';
