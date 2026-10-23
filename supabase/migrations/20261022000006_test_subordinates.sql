CREATE OR REPLACE FUNCTION public._test_subordinates(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_res json;
BEGIN
  SELECT json_agg(row_to_json(r))
  INTO v_res
  FROM (
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
    ORDER BY p.rol DESC, p.nombre ASC
  ) r;

  RETURN v_res;
END;
$$;
