-- =====================================================================
-- ZENDA - MIGRACIÓN 05: Panel de Administrador
-- Columnas de permisos en profiles, RPCs administrativos, RLS updates
-- Idempotente: seguro ejecutar múltiples veces
-- =====================================================================

-- =====================================================================
-- 1. COLUMNAS DE PERMISOS EN PROFILES
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='dinero_max_caja') THEN
    ALTER TABLE public.profiles ADD COLUMN dinero_max_caja numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='dinero_max_venta') THEN
    ALTER TABLE public.profiles ADD COLUMN dinero_max_venta numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='dinero_max_gasto') THEN
    ALTER TABLE public.profiles ADD COLUMN dinero_max_gasto numeric(14,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='max_cuotas') THEN
    ALTER TABLE public.profiles ADD COLUMN max_cuotas integer DEFAULT 30;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='permite_borrar_venta') THEN
    ALTER TABLE public.profiles ADD COLUMN permite_borrar_venta boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='permite_modificar_pagos') THEN
    ALTER TABLE public.profiles ADD COLUMN permite_modificar_pagos boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='activo') THEN
    ALTER TABLE public.profiles ADD COLUMN activo boolean DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='apellido') THEN
    ALTER TABLE public.profiles ADD COLUMN apellido text DEFAULT '';
  END IF;
END $$;

-- =====================================================================
-- 2. Columna 'castigado' en invoice (para bloquear créditos morosos)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='invoice' AND column_name='castigado') THEN
    ALTER TABLE public.invoice ADD COLUMN castigado boolean DEFAULT false;
  END IF;
END $$;

-- =====================================================================
-- 3. RPC: admin_get_subordinates
-- Retorna todos los usuarios subordinados al admin logueado
-- =====================================================================
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
  -- Verificar que el usuario sea admin
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
    p.id, p.nombre, p.apellido,
    COALESCE(au.email, '') AS email,
    p.rol, p.superior_id, p.activo,
    p.dinero_max_caja, p.dinero_max_venta, p.dinero_max_gasto,
    p.max_cuotas, p.permite_borrar_venta, p.permite_modificar_pagos
  FROM public.profiles p
  LEFT JOIN auth.users au ON au.id = p.id
  WHERE p.id IN (SELECT subordinates.id FROM subordinates)
  ORDER BY p.rol DESC, p.nombre ASC;
END;
$$;

-- =====================================================================
-- 3b. RPC: admin_create_user — crear nuevo usuario en auth + profile
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_nombre text,
  p_apellido text,
  p_rol text DEFAULT 'vendedor',
  p_dinero_max_caja numeric DEFAULT 0,
  p_dinero_max_venta numeric DEFAULT 0,
  p_dinero_max_gasto numeric DEFAULT 0,
  p_max_cuotas integer DEFAULT 30,
  p_permite_borrar_venta boolean DEFAULT false,
  p_permite_modificar_pagos boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_id uuid;
  v_encrypted_pw text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: solo administradores pueden crear usuarios';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS: ya existe un usuario con este correo';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_pw,
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object('nombre', p_nombre, 'apellido', p_apellido)::jsonb,
    now(),
    now(),
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    v_new_id::text,
    v_new_id,
    json_build_object(
      'sub', v_new_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false
    )::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  INSERT INTO public.profiles (
    id,
    nombre,
    apellido,
    rol,
    superior_id,
    activo,
    dinero_max_caja,
    dinero_max_venta,
    dinero_max_gasto,
    max_cuotas,
    permite_borrar_venta,
    permite_modificar_pagos
  ) VALUES (
    v_new_id,
    p_nombre,
    p_apellido,
    COALESCE(p_rol, 'vendedor'),
    auth.uid(),
    true,
    COALESCE(p_dinero_max_caja, 0),
    COALESCE(p_dinero_max_venta, 0),
    COALESCE(p_dinero_max_gasto, 0),
    COALESCE(p_max_cuotas, 30),
    COALESCE(p_permite_borrar_venta, false),
    COALESCE(p_permite_modificar_pagos, false)
  )
  ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    apellido = EXCLUDED.apellido,
    rol = EXCLUDED.rol,
    superior_id = EXCLUDED.superior_id,
    activo = true,
    dinero_max_caja = EXCLUDED.dinero_max_caja,
    dinero_max_venta = EXCLUDED.dinero_max_venta,
    dinero_max_gasto = EXCLUDED.dinero_max_gasto,
    max_cuotas = EXCLUDED.max_cuotas,
    permite_borrar_venta = EXCLUDED.permite_borrar_venta,
    permite_modificar_pagos = EXCLUDED.permite_modificar_pagos;

  RETURN json_build_object('success', true, 'user_id', v_new_id);
END;
$$;

-- =====================================================================
-- 4. RPC: admin_update_user — actualizar permisos de un subordinado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id uuid,
  p_nombre text DEFAULT NULL,
  p_apellido text DEFAULT NULL,
  p_dinero_max_caja numeric DEFAULT NULL,
  p_dinero_max_venta numeric DEFAULT NULL,
  p_dinero_max_gasto numeric DEFAULT NULL,
  p_max_cuotas integer DEFAULT NULL,
  p_permite_borrar_venta boolean DEFAULT NULL,
  p_permite_modificar_pagos boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: solo administradores pueden editar usuarios';
  END IF;

  -- Verificar que el usuario esté en la jerarquía
  IF NOT public.is_same_hierarchy(p_user_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: usuario no pertenece a tu jerarquía';
  END IF;

  UPDATE public.profiles SET
    nombre = COALESCE(p_nombre, nombre),
    apellido = COALESCE(p_apellido, apellido),
    dinero_max_caja = COALESCE(p_dinero_max_caja, dinero_max_caja),
    dinero_max_venta = COALESCE(p_dinero_max_venta, dinero_max_venta),
    dinero_max_gasto = COALESCE(p_dinero_max_gasto, dinero_max_gasto),
    max_cuotas = COALESCE(p_max_cuotas, max_cuotas),
    permite_borrar_venta = COALESCE(p_permite_borrar_venta, permite_borrar_venta),
    permite_modificar_pagos = COALESCE(p_permite_modificar_pagos, permite_modificar_pagos)
  WHERE id = p_user_id;

  RETURN json_build_object('success', true, 'user_id', p_user_id);
END;
$$;

-- =====================================================================
-- 5. RPC: admin_toggle_user — habilitar/inhabilitar subordinado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_toggle_user(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_state boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: solo administradores';
  END IF;
  IF NOT public.is_same_hierarchy(p_user_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: usuario no pertenece a tu jerarquía';
  END IF;

  UPDATE public.profiles
    SET activo = NOT activo
    WHERE id = p_user_id
    RETURNING activo INTO v_new_state;

  RETURN json_build_object('success', true, 'user_id', p_user_id, 'activo', v_new_state);
END;
$$;

-- =====================================================================
-- 6. RPC: admin_get_cartera_summary
-- Resumen de cartera por vendedor (saldos al cierre del día anterior)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_get_cartera_summary()
RETURNS TABLE (
  usuario_id uuid,
  nombre text,
  apellido text,
  rol text,
  activo boolean,
  total_creditos bigint,
  clientes_con_saldo bigint,
  valor_cuota_periodica numeric,
  saldo_vencido numeric,
  valor_total_cartera numeric,
  saldo_total numeric
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
  -- Incluir al propio admin
  all_users AS (
    SELECT id FROM subordinates
    UNION SELECT auth.uid()
  ),
  -- Saldo vencido: cuotas vencidas pendientes
  vencidas AS (
    SELECT i.usuario_id,
           COALESCE(SUM(c.monto - COALESCE(c.monto_pagado, 0)), 0) AS saldo_venc
    FROM public.cuotas c
    JOIN public.invoice i ON i.id = c.invoice_id
    WHERE c.estado IN ('pendiente', 'parcial')
      AND c.fecha_vencimiento < CURRENT_DATE
      AND i.usuario_id IN (SELECT id FROM all_users)
      AND i.castigado = false
    GROUP BY i.usuario_id
  )
  SELECT
    p.id AS usuario_id,
    p.nombre,
    p.apellido,
    p.rol,
    p.activo,
    COUNT(DISTINCT i.id) AS total_creditos,
    COUNT(DISTINCT CASE WHEN i.saldo > 0 THEN i.id END) AS clientes_con_saldo,
    COALESCE(SUM(CASE WHEN i.saldo > 0 THEN
      COALESCE((SELECT c2.monto FROM public.cuotas c2 WHERE c2.invoice_id = i.id AND c2.estado IN ('pendiente','parcial') ORDER BY c2.numero LIMIT 1), 0)
    ELSE 0 END), 0) AS valor_cuota_periodica,
    COALESCE(v.saldo_venc, 0) AS saldo_vencido,
    COALESCE(SUM(i.amount), 0) AS valor_total_cartera,
    COALESCE(SUM(i.saldo), 0) AS saldo_total
  FROM public.profiles p
  LEFT JOIN public.invoice i ON i.usuario_id = p.id AND i.castigado = false
  LEFT JOIN vencidas v ON v.usuario_id = p.id
  WHERE p.id IN (SELECT id FROM all_users)
  GROUP BY p.id, p.nombre, p.apellido, p.rol, p.activo, v.saldo_venc
  ORDER BY p.rol DESC, p.nombre ASC;
END;
$$;

-- =====================================================================
-- 7. RPC: admin_get_cartera_detail — clientes de un vendedor
-- =====================================================================
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
    i.id AS invoice_id,
    i.client_id,
    cl.nombre AS nombre_cliente,
    cl.apellido AS apellido_cliente,
    cl.telefono,
    cl.documento,
    i.saldo,
    i.amount AS saldo_inicial,
    COALESCE((
      SELECT SUM(c.monto - COALESCE(c.monto_pagado, 0))
      FROM public.cuotas c
      WHERE c.invoice_id = i.id AND c.estado IN ('pendiente','parcial') AND c.fecha_vencimiento < CURRENT_DATE
    ), 0) AS saldo_vencido,
    (SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id AND c.estado IN ('pendiente','parcial')) AS cuotas_restantes,
    (SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id AND c.estado = 'pagada') + 1 AS cuota_actual,
    (SELECT COUNT(*) FROM public.cuotas c WHERE c.invoice_id = i.id) AS cuotas_totales,
    i.created_at AS fecha_inicio,
    (SELECT MAX(c.fecha_vencimiento) FROM public.cuotas c WHERE c.invoice_id = i.id) AS fecha_fin,
    i.status,
    i.castigado
  FROM public.invoice i
  JOIN public.clients cl ON cl.id = i.client_id
  WHERE i.usuario_id = p_usuario_id
    AND i.saldo > 0
    AND i.castigado = false
  ORDER BY i.saldo DESC;
END;
$$;

-- =====================================================================
-- 8. RPC: admin_castigar_cartera — bloquear crédito moroso
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_castigar_cartera(p_invoice_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT usuario_id INTO v_usuario_id FROM public.invoice WHERE id = p_invoice_id;
  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND';
  END IF;
  IF NOT public.is_same_hierarchy(v_usuario_id) AND v_usuario_id <> auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.invoice SET castigado = true WHERE id = p_invoice_id;

  RETURN json_build_object('success', true, 'invoice_id', p_invoice_id);
END;
$$;

-- =====================================================================
-- 9. RPC: admin_get_cajas — cajas con stats calculados
-- =====================================================================
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
    c.id AS caja_id,
    c.usuario_id,
    p.nombre AS nombre_usuario,
    p.rol AS rol_usuario,
    c.estado,
    c.fecha_apertura,
    c.fecha_cierre,
    c.saldo_inicial,
    c.saldo_final,
    -- Valor debido cobrar (cuotas del día para facturas activas)
    COALESCE((
      SELECT SUM(cu.monto) FROM public.cuotas cu
      JOIN public.invoice inv ON inv.id = cu.invoice_id
      WHERE inv.usuario_id = c.usuario_id AND cu.estado IN ('pendiente','parcial')
        AND inv.saldo > 0 AND inv.castigado = false
    ), 0) AS valor_debido_cobrar,
    -- Valor recaudado (pagos tipo 'pago' en esta caja)
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'pago'), 0) AS valor_recaudado,
    -- Ventas
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'venta'), 0) AS valor_ventas,
    -- Gastos (retiros con descripción de gasto)
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'retiro' AND m.descripcion ILIKE '%gasto%'), 0) AS valor_gastos,
    -- Ingresos
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'ingreso'), 0) AS valor_ingresos,
    -- Retiros
    COALESCE((SELECT SUM(m.monto) FROM public.cash_movements m WHERE m.caja_id = c.id AND m.tipo = 'retiro'), 0) AS valor_retiros,
    -- Total clientes (facturas activas del vendedor)
    (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false) AS total_clientes,
    -- NoPagos del día
    COALESCE((SELECT COUNT(*) FROM public.payments pay
      JOIN public.invoice inv ON inv.id = pay.invoice_id
      WHERE inv.usuario_id = c.usuario_id AND pay.method = 'nopago'
        AND pay.payment_date = CURRENT_DATE), 0) AS cantidad_nopagos,
    -- Progreso visitas (pagos del día / total clientes * 100)
    CASE WHEN (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false) > 0
    THEN ROUND(
      (SELECT COUNT(DISTINCT pay.invoice_id)::numeric FROM public.payments pay
       JOIN public.invoice inv ON inv.id = pay.invoice_id
       WHERE inv.usuario_id = c.usuario_id AND pay.payment_date = CURRENT_DATE) * 100.0 /
      (SELECT COUNT(DISTINCT inv.client_id) FROM public.invoice inv WHERE inv.usuario_id = c.usuario_id AND inv.saldo > 0 AND inv.castigado = false)
    , 1)
    ELSE 0 END AS progreso_visitas
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

-- =====================================================================
-- 10. RPC: admin_abrir_cajas_masivo — abre caja a todos los subordinados
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_abrir_cajas_masivo(p_saldo_inicial numeric DEFAULT 0)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_sub record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  FOR v_sub IN
    WITH RECURSIVE subordinates AS (
      SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid() AND p.activo = true
      UNION ALL
      SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id WHERE p.activo = true
    )
    SELECT id FROM subordinates
    WHERE id NOT IN (SELECT usuario_id FROM public.cajas WHERE estado = 'abierta')
  LOOP
    INSERT INTO public.cajas (usuario_id, estado, saldo_inicial)
    VALUES (v_sub.id, 'abierta', ROUND(p_saldo_inicial, 2));
    v_count := v_count + 1;
  END LOOP;

  -- También abrir la del admin si no tiene
  IF NOT EXISTS (SELECT 1 FROM public.cajas WHERE usuario_id = auth.uid() AND estado = 'abierta') THEN
    INSERT INTO public.cajas (usuario_id, estado, saldo_inicial)
    VALUES (auth.uid(), 'abierta', ROUND(p_saldo_inicial, 2));
    v_count := v_count + 1;
  END IF;

  RETURN json_build_object('success', true, 'cajas_abiertas', v_count);
END;
$$;

-- =====================================================================
-- 11. RPC: admin_get_morosos — top 50 clientes morosos
-- =====================================================================
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
    i.id AS invoice_id,
    cl.nombre AS nombre_cliente,
    cl.apellido AS apellido_cliente,
    pv.nombre AS nombre_vendedor,
    i.usuario_id AS vendedor_id,
    i.saldo,
    i.amount AS saldo_inicial,
    COALESCE((
      SELECT SUM(cu.monto - COALESCE(cu.monto_pagado, 0))
      FROM public.cuotas cu
      WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE
    ), 0) AS saldo_vencido,
    (SELECT COUNT(*) FROM public.cuotas cu WHERE cu.invoice_id = i.id) AS cuotas_totales,
    (SELECT COUNT(*) FROM public.cuotas cu WHERE cu.invoice_id = i.id AND cu.estado IN ('pendiente','parcial') AND cu.fecha_vencimiento < CURRENT_DATE) AS cuotas_vencidas,
    (SELECT MAX(cu.fecha_vencimiento) FROM public.cuotas cu WHERE cu.invoice_id = i.id) AS fecha_fin,
    (SELECT MAX(pay.payment_date) FROM public.payments pay WHERE pay.invoice_id = i.id AND pay.amount > 0) AS fecha_ultimo_pago
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

-- =====================================================================
-- 11b. RPC: admin_reporte_consolidado — reporte por rango de fechas
-- =====================================================================
CREATE OR REPLACE FUNCTION public.admin_reporte_consolidado(
  p_fecha_ini date,
  p_fecha_fin date
)
RETURNS TABLE (
  usuario_id uuid,
  nombre text,
  apellido text,
  rol text,
  total_recaudado numeric,
  total_ventas numeric,
  total_gastos numeric,
  total_ingresos numeric,
  total_retiros numeric,
  total_nopagos bigint,
  saldo_cartera_actual numeric
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
    p.id AS usuario_id,
    p.nombre,
    p.apellido,
    p.rol,
    -- Recaudado en el periodo
    COALESCE((
      SELECT SUM(m.monto)
      FROM public.cash_movements m
      JOIN public.cajas c ON c.id = m.caja_id
      WHERE c.usuario_id = p.id
        AND m.tipo = 'pago'
        AND m.created_at::date >= p_fecha_ini
        AND m.created_at::date <= p_fecha_fin
    ), 0) AS total_recaudado,
    -- Ventas en el periodo
    COALESCE((
      SELECT SUM(m.monto)
      FROM public.cash_movements m
      JOIN public.cajas c ON c.id = m.caja_id
      WHERE c.usuario_id = p.id
        AND m.tipo = 'venta'
        AND m.created_at::date >= p_fecha_ini
        AND m.created_at::date <= p_fecha_fin
    ), 0) AS total_ventas,
    -- Gastos en el periodo (retiros con descripción gasto)
    COALESCE((
      SELECT SUM(m.monto)
      FROM public.cash_movements m
      JOIN public.cajas c ON c.id = m.caja_id
      WHERE c.usuario_id = p.id
        AND m.tipo = 'retiro'
        AND m.descripcion ILIKE '%gasto%'
        AND m.created_at::date >= p_fecha_ini
        AND m.created_at::date <= p_fecha_fin
    ), 0) AS total_gastos,
    -- Ingresos en el periodo
    COALESCE((
      SELECT SUM(m.monto)
      FROM public.cash_movements m
      JOIN public.cajas c ON c.id = m.caja_id
      WHERE c.usuario_id = p.id
        AND m.tipo = 'ingreso'
        AND m.created_at::date >= p_fecha_ini
        AND m.created_at::date <= p_fecha_fin
    ), 0) AS total_ingresos,
    -- Retiros en el periodo
    COALESCE((
      SELECT SUM(m.monto)
      FROM public.cash_movements m
      JOIN public.cajas c ON c.id = m.caja_id
      WHERE c.usuario_id = p.id
        AND m.tipo = 'retiro'
        AND m.created_at::date >= p_fecha_ini
        AND m.created_at::date <= p_fecha_fin
    ), 0) AS total_retiros,
    -- No pagos registrados en el periodo
    COALESCE((
      SELECT COUNT(*)
      FROM public.payments pay
      JOIN public.invoice inv ON inv.id = pay.invoice_id
      WHERE inv.usuario_id = p.id
        AND pay.method = 'nopago'
        AND pay.payment_date >= p_fecha_ini
        AND pay.payment_date <= p_fecha_fin
    ), 0) AS total_nopagos,
    -- Saldo cartera actual (a hoy)
    COALESCE((
      SELECT SUM(inv.saldo)
      FROM public.invoice inv
      WHERE inv.usuario_id = p.id
        AND inv.castigado = false
        AND inv.saldo > 0
    ), 0) AS saldo_cartera_actual
  FROM public.profiles p
  WHERE p.id IN (SELECT id FROM all_users)
  ORDER BY p.rol DESC, p.nombre ASC;
END;
$$;

-- =====================================================================
-- 12. Actualizar RLS: admin puede INSERT cajas de subordinados (masivo)
-- =====================================================================
DROP POLICY IF EXISTS "cajas_insert" ON public.cajas;
CREATE POLICY "cajas_insert" ON public.cajas
  FOR INSERT WITH CHECK (
    usuario_id = auth.uid()
    OR (public.is_admin() AND public.is_same_hierarchy(usuario_id))
  );

-- Admin puede UPDATE permisos de subordinados
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    id = auth.uid()
    OR (public.is_admin() AND public.is_same_hierarchy(id))
  );

-- =====================================================================
-- 13. Índice para castigado
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_invoice_castigado ON public.invoice(castigado);

COMMENT ON FUNCTION public.admin_get_subordinates IS 'Retorna subordinados directos e indirectos del admin logueado';
COMMENT ON FUNCTION public.admin_update_user IS 'Actualiza permisos y datos de un subordinado';
COMMENT ON FUNCTION public.admin_toggle_user IS 'Habilita/inhabilita un subordinado';
COMMENT ON FUNCTION public.admin_get_cartera_summary IS 'Resumen de cartera por vendedor con saldos';
COMMENT ON FUNCTION public.admin_get_cartera_detail IS 'Detalle de facturas y clientes de un vendedor';
COMMENT ON FUNCTION public.admin_castigar_cartera IS 'Bloquea un crédito moroso';
COMMENT ON FUNCTION public.admin_get_cajas IS 'Lista cajas con stats calculados para admin';
COMMENT ON FUNCTION public.admin_abrir_cajas_masivo IS 'Abre caja a todos los subordinados activos';
COMMENT ON FUNCTION public.admin_get_morosos IS 'Top N clientes morosos de la jerarquía';
