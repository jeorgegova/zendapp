-- =====================================================================
-- ZENDA - MIGRACIÓN 09: Fix exact column types in admin RPCs
-- =====================================================================

-- Limpiar funciones de prueba
DROP FUNCTION IF EXISTS public._test_subordinates(uuid);
DROP FUNCTION IF EXISTS public._check_triggers();
DROP FUNCTION IF EXISTS public._check_types();
DROP FUNCTION IF EXISTS public._call_admin_get_subordinates();
DROP FUNCTION IF EXISTS public._call_admin_get_subordinates_test(uuid);
DROP FUNCTION IF EXISTS public._test_return_query(uuid);

-- 1. Corregir admin_get_subordinates con COALESCE(au.email, '')::text
CREATE OR REPLACE FUNCTION public.admin_get_subordinates()
RETURNS TABLE (
  id uuid,
  nombre text,
  apellido text,
  email text,
  rol text,
  superior_id uuid,
  activo boolean,
  dinero_max_caja numeric,
  dinero_max_venta numeric,
  dinero_max_gasto numeric,
  max_cuotas integer,
  permite_borrar_venta boolean,
  permite_modificar_pagos boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: solo administradores pueden ver subordinados';
  END IF;

  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN subordinates s ON p.superior_id = s.id
  )
  SELECT
    p.id::uuid,
    COALESCE(p.nombre, '')::text,
    COALESCE(p.apellido, '')::text,
    COALESCE(au.email, '')::text AS email,
    COALESCE(p.rol, 'vendedor')::text,
    p.superior_id::uuid,
    COALESCE(p.activo, true)::boolean,
    COALESCE(p.dinero_max_caja, 0)::numeric,
    COALESCE(p.dinero_max_venta, 0)::numeric,
    COALESCE(p.dinero_max_gasto, 0)::numeric,
    COALESCE(p.max_cuotas, 30)::integer,
    COALESCE(p.permite_borrar_venta, false)::boolean,
    COALESCE(p.permite_modificar_pagos, false)::boolean
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.id IN (SELECT subordinates.id FROM subordinates)
  ORDER BY p.rol DESC, p.nombre ASC;
END;
$$;

-- 2. Corregir admin_get_cartera_detail con casts explícitos
CREATE OR REPLACE FUNCTION public.admin_get_cartera_detail(p_usuario_id uuid)
RETURNS TABLE (
  invoice_id uuid,
  client_id uuid,
  nombre_cliente text,
  apellido_cliente text,
  telefono text,
  documento text,
  saldo numeric,
  saldo_inicial numeric,
  saldo_vencido numeric,
  cuotas_restantes bigint,
  cuota_actual bigint,
  cuotas_totales bigint,
  fecha_inicio timestamptz,
  fecha_fin date,
  status text,
  castigado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  IF NOT public.is_same_hierarchy(p_usuario_id) AND p_usuario_id <> auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: usuario no pertenece a tu jerarquía';
  END IF;

  RETURN QUERY
  SELECT
    i.id::uuid AS invoice_id,
    i.client_id::uuid,
    COALESCE(cl.nombre, '')::text AS nombre_cliente,
    COALESCE(cl.apellido, '')::text AS apellido_cliente,
    COALESCE(cl.telefono, '')::text,
    COALESCE(cl.documento, '')::text,
    COALESCE(i.saldo, 0)::numeric,
    COALESCE(i.amount, 0)::numeric AS saldo_inicial,
    COALESCE((
      SELECT SUM(c.monto - COALESCE(c.monto_pagado, 0))
      FROM public.cuotas c
      WHERE c.invoice_id = i.id AND c.estado IN ('pendiente','parcial') AND c.fecha_vencimiento < CURRENT_DATE
    ), 0)::numeric AS saldo_vencido,
    (SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id AND c.estado IN ('pendiente','parcial'))::bigint AS cuotas_restantes,
    ((SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id AND c.estado = 'pagada') + 1)::bigint AS cuota_actual,
    (SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id)::bigint AS cuotas_totales,
    i.created_at::timestamptz AS fecha_inicio,
    (SELECT MAX(c.fecha_vencimiento) FROM public.cuotas c WHERE c.invoice_id = i.id)::date AS fecha_fin,
    COALESCE(i.status, '')::text,
    COALESCE(i.castigado, false)::boolean
  FROM public.invoice i
  JOIN public.clients cl ON cl.id = i.client_id
  WHERE i.usuario_id = p_usuario_id
    AND i.saldo > 0
    AND i.castigado = false
  ORDER BY i.saldo DESC;
END;
$$;

-- 3. Corregir admin_get_cajas con casts explícitos
CREATE OR REPLACE FUNCTION public.admin_get_cajas(
  p_fecha_ini date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
RETURNS TABLE (
  caja_id uuid,
  usuario_id uuid,
  nombre_usuario text,
  rol_usuario text,
  estado text,
  fecha_apertura timestamptz,
  fecha_cierre timestamptz,
  saldo_inicial numeric,
  saldo_final numeric,
  valor_debido_cobrar numeric,
  valor_recaudado numeric,
  valor_ventas numeric,
  valor_gastos numeric,
  valor_ingresos numeric,
  valor_retiros numeric,
  total_clientes bigint,
  cantidad_nopagos bigint,
  progreso_visitas numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id
  ),
  all_users AS (
    SELECT id FROM subordinates UNION SELECT auth.uid()
  )
  SELECT
    c.id::uuid AS caja_id,
    c.usuario_id::uuid,
    COALESCE(p.nombre, '')::text AS nombre_usuario,
    COALESCE(p.rol, '')::text AS rol_usuario,
    COALESCE(c.estado, '')::text,
    c.fecha_apertura::timestamptz,
    c.fecha_cierre::timestamptz,
    COALESCE(c.saldo_inicial, 0)::numeric,
    COALESCE(c.saldo_final, 0)::numeric,
    COALESCE((
      SELECT SUM(cu.monto) FROM public.cuotas cu
      JOIN public.invoice inv ON inv.id = cu.invoice_id
      WHERE inv.usuario_id = c.usuario_id AND cu.estado IN ('pendiente','parcial')
        AND inv.saldo > 0 AND inv.castigado = false
    ), 0)::numeric AS valor_debido_cobrar,
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'pago'), 0)::numeric AS valor_recaudado,
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'venta'), 0)::numeric AS valor_ventas,
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'retiro' AND m.descripcion ILIKE '%gasto%'), 0)::numeric AS valor_gastos,
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'ingreso'), 0)::numeric AS valor_ingresos,
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'retiro'), 0)::numeric AS valor_retiros,
    (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false)::bigint AS total_clientes,
    COALESCE((SELECT COUNT(*) FROM public.payments pay
      JOIN public.invoice inv ON inv.id = pay.invoice_id
      WHERE inv.usuario_id = c.usuario_id AND pay.method = 'nopago'
        AND pay.payment_date = CURRENT_DATE), 0)::bigint AS cantidad_nopagos,
    CASE WHEN (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false) > 0
    THEN ROUND(
      (SELECT COUNT(DISTINCT pay.invoice_id)::numeric FROM public.payments pay
       JOIN public.invoice inv ON inv.id = pay.invoice_id
       WHERE inv.usuario_id = c.usuario_id AND pay.payment_date = CURRENT_DATE) * 100.0 /
      (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false)
    , 1)::numeric
    ELSE 0::numeric END AS progreso_visitas
  FROM public.cajas c
  JOIN public.profiles p ON p.id = c.usuario_id
  WHERE c.usuario_id IN (SELECT id FROM all_users)
    AND (p_fecha_ini IS NULL OR c.fecha_apertura::date >= p_fecha_ini)
    AND (p_fecha_fin IS NULL OR c.fecha_apertura::date <= p_fecha_fin)
  ORDER BY
    CASE WHEN c.usuario_id = auth.uid() THEN 0 ELSE 1 END,
    c.estado ASC,
    c.fecha_apertura DESC;
END;
$$;

-- 4. Corregir admin_get_morosos con casts explícitos
CREATE OR REPLACE FUNCTION public.admin_get_morosos(p_limit integer DEFAULT 50)
RETURNS TABLE (
  invoice_id uuid,
  nombre_cliente text,
  apellido_cliente text,
  nombre_vendedor text,
  vendedor_id uuid,
  saldo numeric,
  saldo_inicial numeric,
  saldo_vencido numeric,
  cuotas_totales bigint,
  cuotas_vencidas bigint,
  fecha_fin date,
  fecha_ultimo_pago date
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id
  ),
  all_users AS (SELECT id FROM subordinates UNION SELECT auth.uid())
  SELECT
    i.id::uuid AS invoice_id,
    COALESCE(cl.nombre, '')::text AS nombre_cliente,
    COALESCE(cl.apellido, '')::text AS apellido_cliente,
    COALESCE(pv.nombre, '')::text AS nombre_vendedor,
    i.usuario_id::uuid AS vendedor_id,
    COALESCE(i.saldo, 0)::numeric,
    COALESCE(i.amount, 0)::numeric AS saldo_inicial,
    COALESCE((
      SELECT SUM(cu.monto - COALESCE(cu.monto_pagado, 0))
      FROM public.cuotas cu
      WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE
    ), 0)::numeric AS saldo_vencido,
    (SELECT COUNT(*) FROM public.cuotas cu WHERE cu.invoice_id = i.id)::bigint AS cuotas_totales,
    (SELECT COUNT(*) FROM public.cuotas cu WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE)::bigint AS cuotas_vencidas,
    (SELECT MAX(cu.fecha_vencimiento) FROM public.cuotas cu WHERE cu.invoice_id = i.id)::date AS fecha_fin,
    (SELECT MAX(pay.payment_date) FROM public.payments pay WHERE pay.invoice_id = i.id AND pay.amount > 0)::date AS fecha_ultimo_pago
  FROM public.invoice i
  JOIN public.clients cl ON cl.id = i.client_id
  JOIN public.profiles pv ON pv.id = i.usuario_id
  WHERE i.usuario_id IN (SELECT id FROM all_users)
    AND i.saldo > 0
    AND i.castigado = false
    AND EXISTS (
      SELECT 1 FROM public.cuotas cu
      WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE
    )
  ORDER BY saldo_vencido DESC
  LIMIT p_limit;
END;
$$;
