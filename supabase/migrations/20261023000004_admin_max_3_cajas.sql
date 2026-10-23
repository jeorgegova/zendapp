-- =====================================================================
-- ZENDA - MIGRACIÓN: Reglas de Cajas de Administrador (Hasta 3 simultáneas)
-- 1. Apertura masiva: abre cajas para vendedores y abre una para el admin
--    con la fecha actual (now()), arrastrando saldo anterior.
--    Si el admin ya tiene 3 cajas abiertas, lanza excepción para que cierre una.
-- 2. Cierre de caja (rpc_close_box):
--    Permite al admin cerrar cajas individuales si tiene múltiples abiertas.
-- =====================================================================

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

-- =====================================================================
-- Ajuste en rpc_close_box para permitir al admin cerrar sus cajas
-- =====================================================================
CREATE OR REPLACE FUNCTION public.rpc_close_box(
  p_caja_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_usuario_id            uuid;
  v_estado                text;
  v_saldo_inicial         numeric;
  v_subordinados_abiertos integer := 0;
  v_admin_cajas_abiertas  integer := 0;
  v_mov_total             numeric;
  v_saldo_final_calc      numeric;
BEGIN
  -- Bloquear caja
  SELECT usuario_id, estado, COALESCE(saldo_inicial, 0)
  INTO v_usuario_id, v_estado, v_saldo_inicial
  FROM public.cajas
  WHERE id = p_caja_id
  FOR UPDATE;

  IF v_estado IS NULL THEN
    RAISE EXCEPTION 'CAJA_NOT_FOUND: caja % no existe', p_caja_id;
  END IF;

  IF v_estado <> 'abierta' THEN
    RAISE EXCEPTION 'CAJA_YA_CERRADA: la caja ya se encuentra cerrada';
  END IF;

  -- Contar cajas abiertas del usuario dueño de esta caja
  SELECT COUNT(*) INTO v_admin_cajas_abiertas
  FROM public.cajas
  WHERE usuario_id = v_usuario_id AND estado = 'abierta';

  -- Regla jerarquica: si le queda solo 1 caja abierta al usuario (o la última),
  -- no permitir cerrar si aun tiene subordinados con caja abierta.
  -- Si tiene más de 1 caja abierta, puede cerrar esta caja específica.
  IF v_admin_cajas_abiertas <= 1 THEN
    SELECT COUNT(*) INTO v_subordinados_abiertos
    FROM public.cajas cb
    JOIN public.profiles p ON cb.usuario_id = p.id
    WHERE p.superior_id = v_usuario_id
      AND cb.estado = 'abierta';

    IF v_subordinados_abiertos > 0 THEN
      RAISE EXCEPTION 'NO_PUEDE_CERRAR: tienes % vendedor(es) subordinado(s) con caja abierta. Deben cerrar primero.', v_subordinados_abiertos;
    END IF;
  END IF;

  -- Calcular sumatoria exacta de movimientos
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo IN ('ingreso', 'pago') THEN monto
      WHEN tipo IN ('retiro', 'venta', 'renovacion', 'gasto') THEN -monto
      ELSE 0
    END
  ), 0)
  INTO v_mov_total
  FROM public.cash_movements
  WHERE caja_id = p_caja_id;

  v_saldo_final_calc := v_saldo_inicial + v_mov_total;

  -- Cerrar caja
  UPDATE public.cajas
  SET
    estado = 'cerrada',
    fecha_cierre = NOW(),
    saldo_final = v_saldo_final_calc
  WHERE id = p_caja_id;

  RETURN json_build_object(
    'success',       true,
    'caja_id',       p_caja_id,
    'saldo_inicial', v_saldo_inicial,
    'saldo_final',   v_saldo_final_calc,
    'movimientos',   v_mov_total
  );
END;
$func$;
