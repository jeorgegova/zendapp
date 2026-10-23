-- =====================================================================
-- ZENDA - MIGRACIÓN 15: Database Function get_invoices_vendedor (RPC)
-- Reemplaza la Edge Function RequestInvoce por una función RPC nativa
-- mucho más rápida (sin cold starts y en un solo salto de red).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_invoices_vendedor(p_vendedor_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
#variable_conflict use_column
DECLARE
  v_target_id uuid;
  v_is_ok     boolean;
  v_result    json;
BEGIN
  -- Si no se envía vendedor_id, tomar el usuario autenticado
  v_target_id := COALESCE(p_vendedor_id, auth.uid());

  IF v_target_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no hay sesión activa';
  END IF;

  -- Seguridad: si es diferente al usuario actual, verificar si es admin o de su jerarquía
  IF auth.uid() IS NOT NULL AND v_target_id <> auth.uid() THEN
    SELECT (public.is_admin() OR public.is_same_hierarchy(v_target_id)) INTO v_is_ok;
    IF NOT v_is_ok THEN
      RAISE EXCEPTION 'UNAUTHORIZED: no tienes permiso para ver la cartera de este vendedor';
    END IF;
  END IF;

  SELECT COALESCE(json_agg(
    json_build_object(
      'id', i.id::text,
      'nombreCliente', COALESCE(cl.nombre, ''),
      'apellidoCliente', COALESCE(cl.apellido, ''),
      'aliasCliente', COALESCE(cl.alias, ''),
      'documentoCliente', COALESCE(cl.documento, ''),
      'telefonocliente', COALESCE(cl.telefono, ''),
      'direccion', COALESCE(cl.direccion, ''),
      'cuotasPagas', COALESCE((
        SELECT COUNT(*)
        FROM public.payments pay
        WHERE pay.invoice_id = i.id AND pay.amount > 0
      ), 0),
      'cuotasVencidas', COALESCE((
        SELECT COUNT(*)
        FROM public.cuotas cu
        WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE
      ), 0),
      'detalles', COALESCE((
        SELECT cp.valor
        FROM public.concepts cp
        WHERE cp.id = i.plazo_id
      ), ''),
      'estado', COALESCE(i.status, 'pendiente'),
      'estadoUsuario', COALESCE(p.rol, 'vendedor'),
      'facturaWriteDate', (EXTRACT(EPOCH FROM i.created_at) * 1000)::bigint,
      'latitud', NULL,
      'longitud', NULL,
      'nombreUno', COALESCE(p.nombre || ' ' || COALESCE(p.apellido, ''), ''),
      'nombreDos', NULL,
      'nombreUsuario', COALESCE(p.nombre || ' ' || COALESCE(p.apellido, ''), ''),
      'pagos', COALESCE((
        SELECT json_agg(
          json_build_object(
            'amount', pay.amount,
            'payment_date', pay.payment_date,
            'method', pay.method
          ) ORDER BY pay.payment_date ASC, pay.created_at ASC
        )
        FROM public.payments pay
        WHERE pay.invoice_id = i.id
      ), '[]'::json),
      'partnerId', i.client_id::text,
      'paymentTermId', i.plazo_id,
      'saldo', COALESCE(i.saldo, 0),
      'saldoVencido', COALESCE((
        SELECT SUM(cu.monto - COALESCE(cu.monto_pagado, 0))
        FROM public.cuotas cu
        WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE
      ), 0),
      'usuarioId', i.usuario_id::text,
      'idVendedor', i.usuario_id::text,
      'valorCuota', COALESCE(
        (SELECT cu.monto FROM public.cuotas cu WHERE cu.invoice_id = i.id ORDER BY cu.numero LIMIT 1),
        CASE
          WHEN (SELECT cp.valor FROM public.concepts cp WHERE cp.id = i.plazo_id) ~ '^\d+'
            THEN ROUND(i.amount / GREATEST(1, (regexp_match((SELECT cp.valor FROM public.concepts cp WHERE cp.id = i.plazo_id), '(\d+)'))[1]::numeric), 2)
          ELSE i.amount
        END
      ),
      'valorInicial', COALESCE(i.amount, 0),
      'estadoMovil', 'pendiente',
      'fecha_vencimiento', (SELECT MAX(cu.fecha_vencimiento)::text FROM public.cuotas cu WHERE cu.invoice_id = i.id),
      'fecha', i.created_at::text,
      'num_cuotas', COALESCE(
        (SELECT cp.valor FROM public.concepts cp WHERE cp.id = i.plazo_id),
        (SELECT COUNT(*)::text FROM public.cuotas cu WHERE cu.invoice_id = i.id)
      )
    )
    ORDER BY i.created_at DESC
  ), '[]'::json) INTO v_result
  FROM public.invoice i
  JOIN public.clients cl ON cl.id = i.client_id
  LEFT JOIN public.profiles p ON p.id = i.usuario_id
  WHERE i.usuario_id = v_target_id
    AND i.saldo > 0
    AND COALESCE(i.castigado, false) = false;

  RETURN v_result;
END;
$$;
