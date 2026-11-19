-- ============================================================================
-- Panadería Santa Fé (El Refugio & Zakia)
-- Esquema SQL completo para Supabase (Proyecto: icroicyyekqxmufyxeqc)
-- Copia y pega este script en Supabase -> SQL Editor -> Run
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.bakery_tickets (
  id TEXT PRIMARY KEY,
  folio TEXT,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_tickets_date ON public.bakery_tickets (date DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_tickets_branch ON public.bakery_tickets (branch);

CREATE TABLE IF NOT EXISTS public.bakery_orders (
  id TEXT PRIMARY KEY,
  folio TEXT,
  branch TEXT DEFAULT 'refugio',
  delivery_date TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_orders_delivery_date ON public.bakery_orders (delivery_date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_shift_cuts (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  shift_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_shift_cuts_date ON public.bakery_shift_cuts (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_outflows (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_outflows_date ON public.bakery_outflows (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_customers (
  id TEXT PRIMARY KEY,
  phone TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_daily_deliveries (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  shift TEXT NOT NULL,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_daily_deliveries_date ON public.bakery_daily_deliveries (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_driver_customers (
  id TEXT PRIMARY KEY,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_driver_settlements (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  shift TEXT,
  settled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_driver_settlements_date ON public.bakery_driver_settlements (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_operational_expenses (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_operational_expenses_date ON public.bakery_operational_expenses (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_supplier_bills (
  id TEXT PRIMARY KEY,
  date TEXT,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_supplier_bills_date ON public.bakery_supplier_bills (date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_supplier_bank_profiles (
  id TEXT PRIMARY KEY,
  branch TEXT DEFAULT 'refugio',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_vip_customers (
  id TEXT PRIMARY KEY,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.bakery_vip_orders (
  id TEXT PRIMARY KEY,
  delivery_date TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_bakery_vip_orders_date ON public.bakery_vip_orders (delivery_date DESC);

CREATE TABLE IF NOT EXISTS public.bakery_deleted_records (
  entity_id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bakery_deleted_records_entity ON public.bakery_deleted_records (entity);
CREATE INDEX IF NOT EXISTS idx_bakery_deleted_records_deleted_at ON public.bakery_deleted_records (deleted_at DESC);

-- Índices en updated_at para sincronización incremental ultra-rápida (<10ms)
CREATE INDEX IF NOT EXISTS idx_bakery_tickets_updated_at ON public.bakery_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_orders_updated_at ON public.bakery_orders (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_shift_cuts_updated_at ON public.bakery_shift_cuts (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_outflows_updated_at ON public.bakery_outflows (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_daily_deliveries_updated_at ON public.bakery_daily_deliveries (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_driver_settlements_updated_at ON public.bakery_driver_settlements (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_operational_expenses_updated_at ON public.bakery_operational_expenses (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_supplier_bills_updated_at ON public.bakery_supplier_bills (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bakery_vip_orders_updated_at ON public.bakery_vip_orders (updated_at DESC);

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'bakery_tickets',
    'bakery_orders',
    'bakery_shift_cuts',
    'bakery_outflows',
    'bakery_customers',
    'bakery_daily_deliveries',
    'bakery_driver_customers',
    'bakery_driver_settlements',
    'bakery_operational_expenses',
    'bakery_supplier_bills',
    'bakery_supplier_bank_profiles',
    'bakery_vip_customers',
    'bakery_vip_orders',
    'bakery_deleted_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "pos_full_access_%s" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "pos_full_access_%s" ON public.%I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      tbl,
      tbl
    );
  END LOOP;
END $$;

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'bakery_tickets',
    'bakery_orders',
    'bakery_shift_cuts',
    'bakery_outflows',
    'bakery_customers',
    'bakery_daily_deliveries',
    'bakery_driver_customers',
    'bakery_driver_settlements',
    'bakery_operational_expenses',
    'bakery_supplier_bills',
    'bakery_supplier_bank_profiles',
    'bakery_vip_customers',
    'bakery_vip_orders',
    'bakery_deleted_records'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', tbl);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Bucket público para imágenes/comprobantes/facturas en tiempo real desde cualquier celular
INSERT INTO storage.buckets (id, name, public)
VALUES ('santafe-media', 'santafe-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "santafe_media_public_read" ON storage.objects;
CREATE POLICY "santafe_media_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'santafe-media');

DROP POLICY IF EXISTS "santafe_media_public_write" ON storage.objects;
CREATE POLICY "santafe_media_public_write"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'santafe-media');

DROP POLICY IF EXISTS "santafe_media_public_update" ON storage.objects;
CREATE POLICY "santafe_media_public_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'santafe-media')
  WITH CHECK (bucket_id = 'santafe-media');

