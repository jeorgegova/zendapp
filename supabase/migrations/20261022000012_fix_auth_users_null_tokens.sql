-- =====================================================================
-- ZENDA - MIGRACIÓN 12: Fix Database error querying schema (NULL token strings en auth.users)
-- =====================================================================

-- 1. Actualizar registros existentes en auth.users para evitar Scan error en GoTrue
UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  recovery_token = COALESCE(recovery_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change = COALESCE(phone_change, ''),
  phone_change_token = COALESCE(phone_change_token, ''),
  reauthentication_token = COALESCE(reauthentication_token, '')
WHERE
  confirmation_token IS NULL
  OR recovery_token IS NULL
  OR email_change IS NULL
  OR email_change_token_new IS NULL
  OR email_change_token_current IS NULL
  OR phone_change IS NULL
  OR phone_change_token IS NULL
  OR reauthentication_token IS NULL;

-- 2. Actualizar función admin_create_user para incluir todos los campos requeridos por GoTrue
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_email text,
  p_password text,
  p_nombre text,
  p_apellido text DEFAULT '',
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
  v_now timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: solo administradores pueden crear usuarios';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'EMAIL_ALREADY_EXISTS: ya existe un usuario con este correo';
  END IF;

  v_new_id := gen_random_uuid();
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));
  v_now := now();

  -- Insertar en auth.users con todos los campos no-nulos requeridos por GoTrue
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
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    phone_change,
    phone_change_token,
    reauthentication_token,
    is_sso_user,
    is_anonymous
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_new_id,
    'authenticated',
    'authenticated',
    p_email,
    v_encrypted_pw,
    v_now,
    '{"provider":"email","providers":["email"]}'::jsonb,
    json_build_object(
      'sub', v_new_id::text,
      'email', p_email,
      'email_verified', true,
      'phone_verified', false,
      'nombre', p_nombre,
      'apellido', COALESCE(p_apellido, '')
    )::jsonb,
    v_now,
    v_now,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
  );

  -- Insertar en auth.identities
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
    v_now,
    v_now,
    v_now
  );

  -- Insertar en public.profiles
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
    COALESCE(p_apellido, ''),
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
