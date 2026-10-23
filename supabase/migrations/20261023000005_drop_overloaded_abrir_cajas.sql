-- =====================================================================
-- ZENDA - MIGRACIÓN: Eliminar sobrecarga de admin_abrir_cajas_masivo
-- =====================================================================

DROP FUNCTION IF EXISTS public.admin_abrir_cajas_masivo(numeric);
DROP FUNCTION IF EXISTS public.admin_abrir_cajas_masivo();

CREATE OR REPLACE FUNCTION public.admin_abrir_cajas_masivo()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count                 integer := 0;
  v_user_id               uuid;
  v_last_saldo            numeric;
  v_admin_cajas_abiertas  integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Solo administradores pueden ejecutar la apertura masiva.';
  END IF;

  -- 1. Validar límite de cajas abiertas del admin (máximo 3 al tiempo)
  SELECT COUNT(*)
  INTO v_admin_cajas_abiertas
  FROM public.cajas
  WHERE usuario_id = auth.uid() AND estado = 'abierta';

  IF v_admin_cajas_abiertas >= 3 THEN
    RAISE EXCEPTION 'Tienes 3 cajas abiertas al mismo tiempo. Debes cerrar al menos una de tus cajas antes de realizar la apertura.';
  END IF;

  -- 2. Abrir caja para el propio administrador con la fecha actual (now())
  SELECT COALESCE(c.saldo_final, c.saldo_inicial, 0)
  INTO v_last_saldo
  FROM public.cajas c
  WHERE c.usuario_id = auth.uid()
  ORDER BY c.fecha_apertura DESC
  LIMIT 1;

  IF v_last_saldo IS NULL THEN
    v_last_saldo := 0;
  END IF;

  INSERT INTO public.cajas (usuario_id, estado, saldo_inicial, saldo_final, fecha_apertura)
  VALUES (auth.uid(), 'abierta', ROUND(v_last_saldo, 2), ROUND(v_last_saldo, 2), now());

  v_count := v_count + 1;

  -- 3. Abrir cajas para los vendedores subordinados que NO tengan caja abierta
  FOR v_user_id IN
    WITH RECURSIVE subordinates AS (
      SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid() AND p.activo = true
      UNION ALL
      SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id WHERE p.activo = true
    )
    SELECT id FROM subordinates
    WHERE id NOT IN (SELECT usuario_id FROM public.cajas WHERE estado = 'abierta')
  LOOP
    SELECT COALESCE(c.saldo_final, c.saldo_inicial, 0)
    INTO v_last_saldo
    FROM public.cajas c
    WHERE c.usuario_id = v_user_id
    ORDER BY c.fecha_apertura DESC
    LIMIT 1;

    IF v_last_saldo IS NULL THEN
      v_last_saldo := 0;
    END IF;

    INSERT INTO public.cajas (usuario_id, estado, saldo_inicial, saldo_final, fecha_apertura)
    VALUES (v_user_id, 'abierta', ROUND(v_last_saldo, 2), ROUND(v_last_saldo, 2), now());

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'cajas_abiertas', v_count,
    'admin_cajas_abiertas', v_admin_cajas_abiertas + 1
  );
END;
$$;
