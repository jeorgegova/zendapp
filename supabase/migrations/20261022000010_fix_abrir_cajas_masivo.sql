-- =====================================================================
-- ZENDA - MIGRACIÓN 10: Abrir cajas masivo con saldo arrastrado automáticamente
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_abrir_cajas_masivo()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_user_id uuid;
  v_last_saldo numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  FOR v_user_id IN
    WITH RECURSIVE subordinates AS (
      SELECT p.id FROM public.profiles p WHERE p.superior_id = auth.uid() AND p.activo = true
      UNION ALL
      SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id WHERE p.activo = true
    ),
    candidates AS (
      SELECT id FROM subordinates
      UNION SELECT auth.uid()
    )
    SELECT id FROM candidates
    WHERE id NOT IN (SELECT usuario_id FROM public.cajas WHERE estado = 'abierta')
  LOOP
    -- Buscar el saldo final de la última caja registrada para este usuario
    SELECT COALESCE(c.saldo_final, c.saldo_inicial, 0)
    INTO v_last_saldo
    FROM public.cajas c
    WHERE c.usuario_id = v_user_id
    ORDER BY c.fecha_apertura DESC
    LIMIT 1;

    -- Si no existe ninguna caja previa, el saldo inicial es 0
    IF v_last_saldo IS NULL THEN
      v_last_saldo := 0;
    END IF;

    INSERT INTO public.cajas (usuario_id, estado, saldo_inicial, saldo_final)
    VALUES (v_user_id, 'abierta', ROUND(v_last_saldo, 2), ROUND(v_last_saldo, 2));

    v_count := v_count + 1;
  END LOOP;

  RETURN json_build_object('success', true, 'cajas_abiertas', v_count);
END;
$$;
