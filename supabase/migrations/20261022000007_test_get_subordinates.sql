CREATE OR REPLACE FUNCTION public._test_return_query(p_user_id uuid)
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
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE subordinates AS (
    SELECT p.id FROM public.profiles p WHERE p.superior_id = p_user_id
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
