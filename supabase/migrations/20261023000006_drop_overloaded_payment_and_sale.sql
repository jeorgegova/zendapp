-- =====================================================================
-- ZENDA - MIGRACIÓN: Eliminar sobrecargas de create_payment y create_sale
-- =====================================================================

-- 1. Dropear versión de 6 parámetros de create_payment
DROP FUNCTION IF EXISTS public.create_payment(uuid, uuid, numeric, date, text, uuid);

-- 2. Dropear versión de 12 parámetros de create_sale
DROP FUNCTION IF EXISTS public.create_sale(text, text, text, text, text, text, text, numeric, uuid, uuid, integer, integer);

-- 3. Limpieza dinámica por seguridad: eliminar cualquier sobrecarga residual
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Dropear cualquier create_payment que NO tenga 7 parámetros
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_payment'
      AND p.pronargs <> 7
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;

  -- Dropear cualquier create_sale que NO tenga 14 parámetros
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'create_sale'
      AND p.pronargs <> 14
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
