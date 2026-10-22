-- =====================================================================
-- ZENDA - MIGRACIÓN 01: Constraints, Índices, RLS, Funciones de Jerarquía
-- Fase 1 de la auditoría técnica y corrección de arquitectura
-- Idempotente: seguro ejecutar múltiples veces
-- =====================================================================

-- =====================================================================
-- 1. UNIQUE documento cliente (prevención de duplicados)
-- IMPORTANTE: ejecutar sólo después de haber fusionado duplicados
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clients_documento_unique'
  ) THEN
    BEGIN
      ALTER TABLE public.clients ADD CONSTRAINT clients_documento_unique UNIQUE (documento);
    EXCEPTION WHEN unique_violation THEN
      RAISE WARNING 'Aún existen duplicados en clients.documento — limpiar antes de aplicar UNIQUE';
    END;
  END IF;
END $$;

-- =====================================================================
-- 2. Normalizar saldos de facturas: no debe haber negativos ni residuos
--    de punto flotante (1e-11). Usar numeric(14,2) para evitar esto.
-- =====================================================================
UPDATE public.invoice
  SET saldo = ROUND(saldo::numeric, 2)
  WHERE saldo IS NOT NULL AND saldo <> ROUND(saldo::numeric, 2);

UPDATE public.invoice
  SET saldo = 0, status = 'pagado'
  WHERE saldo < 0 OR (saldo < 0.01 AND status != 'pagado');

-- =====================================================================
-- 3. Índices para rendimiento (idempotentes con IF NOT EXISTS)
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_invoice_client_id   ON public.invoice(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_usuario_id  ON public.invoice(usuario_id);
CREATE INDEX IF NOT EXISTS idx_invoice_plazo_id    ON public.invoice(plazo_id);
CREATE INDEX IF NOT EXISTS idx_invoice_interes_id  ON public.invoice(interes_id);
CREATE INDEX IF NOT EXISTS idx_invoice_status      ON public.invoice(status);
CREATE INDEX IF NOT EXISTS idx_clients_vendedor_id ON public.clients(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clients_documento   ON public.clients(documento);
CREATE INDEX IF NOT EXISTS idx_cash_movements_caja ON public.cash_movements(caja_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tipo ON public.cash_movements(tipo);
CREATE INDEX IF NOT EXISTS idx_profiles_superior   ON public.profiles(superior_id);
CREATE INDEX IF NOT EXISTS idx_profiles_rol        ON public.profiles(rol);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id  ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_invoice_id   ON public.cuotas(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cajas_usuario_id    ON public.cajas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cajas_estado        ON public.cajas(estado);

-- =====================================================================
-- 4. Activar RLS en todas las tablas
-- =====================================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cajas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts       ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 5. Helper: ¿Es el usuario actual un admin?
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

-- =====================================================================
-- 6. Helper: ¿target_user está en la misma jerarquía del usuario actual?
--    (subordinado directo o indirecto, o el propio usuario)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.is_same_hierarchy(target_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH RECURSIVE subordinates AS (
    SELECT id FROM public.profiles WHERE id = auth.uid()
    UNION ALL
    SELECT p.id FROM public.profiles p
    JOIN subordinates s ON p.superior_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM subordinates WHERE id = target_user);
$$;

-- =====================================================================
-- 7. Helper: obtener el superior_id del usuario actual
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_my_superior_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT superior_id FROM public.profiles WHERE id = auth.uid();
$$;

-- =====================================================================
-- 8. POLÍTICAS RLS — concepts: todos los autenticados pueden leer
-- =====================================================================
DROP POLICY IF EXISTS "concepts_read_authenticated" ON public.concepts;
CREATE POLICY "concepts_read_authenticated" ON public.concepts
  FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================================
-- 9. POLÍTICAS RLS — profiles
-- =====================================================================
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    id = auth.uid()
    OR public.is_same_hierarchy(id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Admin puede insertar perfiles (crear vendedores/clientes)
DROP POLICY IF EXISTS "profiles_insert_admin" ON public.profiles;
CREATE POLICY "profiles_insert_admin" ON public.profiles
  FOR INSERT WITH CHECK (public.is_admin());

-- =====================================================================
-- 10. POLÍTICAS RLS — clients
-- =====================================================================
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT USING (
    vendedor_id = auth.uid()
    OR public.is_same_hierarchy(vendedor_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT WITH CHECK (
    vendedor_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE USING (
    vendedor_id = auth.uid()
    OR public.is_same_hierarchy(vendedor_id)
    OR public.is_admin()
  );

-- =====================================================================
-- 11. POLÍTICAS RLS — invoice
-- =====================================================================
DROP POLICY IF EXISTS "invoice_select" ON public.invoice;
CREATE POLICY "invoice_select" ON public.invoice
  FOR SELECT USING (
    usuario_id = auth.uid()
    OR public.is_same_hierarchy(usuario_id)
    OR public.is_admin()
    -- clientes ven sus propias facturas
    OR client_id IN (
      SELECT id FROM public.clients WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "invoice_insert" ON public.invoice;
CREATE POLICY "invoice_insert" ON public.invoice
  FOR INSERT WITH CHECK (
    usuario_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "invoice_update" ON public.invoice;
CREATE POLICY "invoice_update" ON public.invoice
  FOR UPDATE USING (
    usuario_id = auth.uid()
    OR public.is_admin()
  );

-- =====================================================================
-- 12. POLÍTICAS RLS — cajas
-- =====================================================================
DROP POLICY IF EXISTS "cajas_select" ON public.cajas;
CREATE POLICY "cajas_select" ON public.cajas
  FOR SELECT USING (
    usuario_id = auth.uid()
    OR public.is_same_hierarchy(usuario_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "cajas_insert" ON public.cajas;
CREATE POLICY "cajas_insert" ON public.cajas
  FOR INSERT WITH CHECK (
    usuario_id = auth.uid()
  );

DROP POLICY IF EXISTS "cajas_update" ON public.cajas;
CREATE POLICY "cajas_update" ON public.cajas
  FOR UPDATE USING (
    usuario_id = auth.uid()
    OR public.is_admin()
  );

-- =====================================================================
-- 13. POLÍTICAS RLS — cash_movements
-- =====================================================================
DROP POLICY IF EXISTS "cash_movements_select" ON public.cash_movements;
CREATE POLICY "cash_movements_select" ON public.cash_movements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.cajas c
      WHERE c.id = caja_id
        AND (
          c.usuario_id = auth.uid()
          OR public.is_same_hierarchy(c.usuario_id)
          OR public.is_admin()
        )
    )
  );

DROP POLICY IF EXISTS "cash_movements_insert" ON public.cash_movements;
CREATE POLICY "cash_movements_insert" ON public.cash_movements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cajas c
      WHERE c.id = caja_id
        AND c.usuario_id = auth.uid()
        AND c.estado = 'abierta'
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "cash_movements_update" ON public.cash_movements;
CREATE POLICY "cash_movements_update" ON public.cash_movements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.cajas c
      WHERE c.id = caja_id AND c.usuario_id = auth.uid()
    )
    OR public.is_admin()
  );

-- =====================================================================
-- 14. POLÍTICAS RLS — payments
-- =====================================================================
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
  FOR SELECT USING (
    -- vendedor ve pagos de sus clientes
    client_id IN (
      SELECT id FROM public.clients WHERE vendedor_id = auth.uid()
    )
    -- admin ve pagos de su jerarquía
    OR invoice_id IN (
      SELECT id FROM public.invoice WHERE public.is_same_hierarchy(usuario_id)
    )
    -- cliente ve sus propios pagos
    OR client_id = auth.uid()
    OR public.is_admin()
  );

-- Inserción sólo vía RPC (SECURITY DEFINER) — la policy es permisiva
-- porque el RPC ya valida todo internamente
DROP POLICY IF EXISTS "payments_insert_via_rpc" ON public.payments;
CREATE POLICY "payments_insert_via_rpc" ON public.payments
  FOR INSERT WITH CHECK (true);

-- =====================================================================
-- 15. POLÍTICAS RLS — cuotas
-- =====================================================================
DROP POLICY IF EXISTS "cuotas_select" ON public.cuotas;
CREATE POLICY "cuotas_select" ON public.cuotas
  FOR SELECT USING (
    invoice_id IN (
      SELECT id FROM public.invoice
      WHERE usuario_id = auth.uid()
        OR public.is_same_hierarchy(usuario_id)
        OR public.is_admin()
    )
  );

-- =====================================================================
-- 16. TRIGGER: validar monto de pago antes de insertar en payments
-- =====================================================================
CREATE OR REPLACE FUNCTION public.check_payment_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_saldo  numeric;
  v_status text;
BEGIN
  SELECT saldo, status INTO v_saldo, v_status
  FROM public.invoice WHERE id = NEW.invoice_id;

  IF v_saldo IS NULL THEN
    RAISE EXCEPTION 'Factura no existe: %', NEW.invoice_id;
  END IF;

  IF v_status = 'pagado' THEN
    RAISE EXCEPTION 'La factura % ya está completamente pagada', NEW.invoice_id;
  END IF;

  -- Permitir monto 0 para registros de "no pago" (tipo nopago)
  IF NEW.amount < 0 THEN
    RAISE EXCEPTION 'El monto del pago debe ser >= 0';
  END IF;

  IF NEW.amount > 0 AND NEW.amount > v_saldo THEN
    RAISE EXCEPTION 'El monto del pago (%) excede el saldo de la factura (%)', NEW.amount, v_saldo;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_payment ON public.payments;
CREATE TRIGGER trg_check_payment
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_payment_amount();
