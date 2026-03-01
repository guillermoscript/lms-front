-- Add LATAM currencies to the currency_type enum
-- Currently only supports 'usd' and 'eur'

-- Add new values to the enum
DO $$
BEGIN
  -- Check if the enum exists and add values
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'currency_type') THEN
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'mxn'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'cop'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'clp'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'pen'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'ars'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE currency_type ADD VALUE IF NOT EXISTS 'brl'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

-- Add default_currency to tenant_settings if not present
-- Schools can set their preferred currency for student payments
COMMENT ON TABLE platform_plans IS 'Platform billing plans are always in USD. Student payment currencies are per-tenant.';
