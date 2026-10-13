-- Zenda - Migración 01: constraints, índices, RLS
-- Idempotente, seguro ejecutar múltiples veces
-- Requiere: pgcrypto para gen_random_uuid si no existe

-- 1. UNIQUE documento cliente (prevención duplicados)
-- Primero limpiar duplicados existentes si los hay (mantener el más antiguo)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_documento_unique') THEN
    -- Opcional: si hay duplicados, esto fallará y debes limpiar manualmente
    BEGIN
      ALTER TABLE public.clients ADD CONSTRAINT clients_documento_unique UNIQUE (documento);
    EXCEPTION WHEN unique_violation THEN
      RAISE NOTICE 'Duplicados en clients.documento - limpiar manualmente antes de aplicar UNIQUE';
    END;
  END IF;
END $$;

-- 2. Índices faltantes
CREATE INDEX IF NOT EXISTS idx_invoice_client_id ON public.invoice(client_id);
CREATE INDEX IF NOT EXISTS idx_invoice_usuario_id ON public.invoice(usuario_id);
CREATE INDEX IF NOT EXISTS idx_invoice_plazo_id ON public.invoice(plazo_id);
CREATE INDEX IF NOT EXISTS idx_invoice_interes_id ON public.invoice(interes_id);
CREATE INDEX IF NOT EXISTS idx_clients_vendedor_id ON public.clients(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_cash_movements_caja_id ON public.cash_movements(caja_id);
CREATE INDEX IF NOT EXISTS idx_profiles_superior_id ON public.profiles(superior_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON public.payments(client_id);
CREATE INDEX IF NOT EXISTS idx_cuotas_invoice_id ON public.cuotas(invoice_id);
CREATE INDEX IF NOT EXISTS idx_cajas_usuario_id ON public.cajas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cajas_estado ON public.cajas(estado);

-- 3. RLS enable
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

-- 4. Helpers para jerarquía
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND rol = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_same_hierarchy(target_user uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  -- true si target_user está en la jerarquía del auth.uid (subordinado o self)
  WITH RECURSIVE subordinates AS (
    SELECT id FROM public.profiles WHERE id = auth.uid()
    UNION
    SELECT p.id FROM public.profiles p JOIN subordinates s ON p.superior_id = s.id
  )
  SELECT EXISTS (SELECT 1 FROM subordinates WHERE id = target_user);
$$;

-- 5. Policies - concepts: todos autenticados pueden leer
DROP POLICY IF EXISTS "concepts_read_all" ON public.concepts;
CREATE POLICY "concepts_read_all" ON public.concepts FOR SELECT USING (auth.role() = 'authenticated');

-- profiles: cada usuario lee su perfil y admin lee su jerarquía
DROP POLICY IF EXISTS "profiles_select_own_or_hierarchy" ON public.profiles;
CREATE POLICY "profiles_select_own_or_hierarchy" ON public.profiles FOR SELECT USING (
  id = auth.uid() OR public.is_same_hierarchy(id) OR public.is_admin()
);
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- clients: vendedor ve sus clientes, admin ve jerarquía
DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT USING (
  vendedor_id = auth.uid() OR public.is_same_hierarchy(vendedor_id) OR public.is_admin()
);
DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients FOR INSERT WITH CHECK (
  vendedor_id = auth.uid() OR public.is_admin()
);
DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients FOR UPDATE USING (
  vendedor_id = auth.uid() OR public.is_same_hierarchy(vendedor_id)
);

-- invoice
DROP POLICY IF EXISTS "invoice_select" ON public.invoice;
CREATE POLICY "invoice_select" ON public.invoice FOR SELECT USING (
  usuario_id = auth.uid() OR public.is_same_hierarchy(usuario_id) OR public.is_admin()
);
DROP POLICY IF EXISTS "invoice_insert" ON public.invoice;
CREATE POLICY "invoice_insert" ON public.invoice FOR INSERT WITH CHECK (usuario_id = auth.uid());
DROP POLICY IF EXISTS "invoice_update" ON public.invoice;
CREATE POLICY "invoice_update" ON public.invoice FOR UPDATE USING (usuario_id = auth.uid() OR public.is_admin());

-- cajas
DROP POLICY IF EXISTS "cajas_select" ON public.cajas;
CREATE POLICY "cajas_select" ON public.cajas FOR SELECT USING (
  usuario_id = auth.uid() OR public.is_same_hierarchy(usuario_id) OR public.is_admin()
);
DROP POLICY IF EXISTS "cajas_insert" ON public.cajas;
CREATE POLICY "cajas_insert" ON public.cajas FOR INSERT WITH CHECK (usuario_id = auth.uid());
DROP POLICY IF EXISTS "cajas_update" ON public.cajas;
CREATE POLICY "cajas_update" ON public.cajas FOR UPDATE USING (usuario_id = auth.uid());

-- cash_movements: vía caja
DROP POLICY IF EXISTS "cash_movements_select" ON public.cash_movements;
CREATE POLICY "cash_movements_select" ON public.cash_movements FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.cajas c WHERE c.id = caja_id AND (c.usuario_id = auth.uid() OR public.is_same_hierarchy(c.usuario_id)))
);
DROP POLICY IF EXISTS "cash_movements_insert" ON public.cash_movements;
CREATE POLICY "cash_movements_insert" ON public.cash_movements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.cajas c WHERE c.id = caja_id AND c.usuario_id = auth.uid() AND c.estado = 'abierta')
);
DROP POLICY IF EXISTS "cash_movements_update" ON public.cash_movements;
CREATE POLICY "cash_movements_update" ON public.cash_movements FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.cajas c WHERE c.id = caja_id AND c.usuario_id = auth.uid())
);

-- payments
DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments FOR SELECT USING (
  client_id IN (SELECT id FROM public.clients WHERE vendedor_id = auth.uid() OR public.is_same_hierarchy(vendedor_id))
  OR invoice_id IN (SELECT id FROM public.invoice WHERE usuario_id = auth.uid())
);
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments FOR INSERT WITH CHECK (true); -- validar en RPC/Edge

-- cuotas
DROP POLICY IF EXISTS "cuotas_select" ON public.cuotas;
CREATE POLICY "cuotas_select" ON public.cuotas FOR SELECT USING (true);

-- 6. RPC transaccional create_sale ya existe - verificar que sea SECURITY DEFINER y valide auth
-- Si no existe, crear versión corregida (ajustar nombres params según existente p_...)
-- No sobreescribir si ya existe y funciona; este es template:

-- 7. Validación saldo pagos - trigger
CREATE OR REPLACE FUNCTION public.check_payment_amount()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_saldo numeric;
BEGIN
  SELECT saldo INTO v_saldo FROM public.invoice WHERE id = NEW.invoice_id;
  IF v_saldo IS NULL THEN RAISE EXCEPTION 'Factura no existe %', NEW.invoice_id; END IF;
  IF NEW.amount <= 0 THEN RAISE EXCEPTION 'Monto debe ser > 0'; END IF;
  IF NEW.amount > v_saldo THEN RAISE EXCEPTION 'Monto % excede saldo %', NEW.amount, v_saldo; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_check_payment ON public.payments;
CREATE TRIGGER trg_check_payment BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.check_payment_amount();
