-- Create revenue infrastructure tables for multi-tenant SaaS
-- Enables platform fee collection and school payouts via Stripe Connect

-- =====================================================
-- 1. REVENUE SPLITS TABLE
-- Defines platform/school revenue split per tenant
-- =====================================================

CREATE TABLE IF NOT EXISTS revenue_splits (
  split_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Split percentages (must total 100)
  platform_percentage NUMERIC(5,2) NOT NULL DEFAULT 20.00 
    CHECK (platform_percentage >= 0 AND platform_percentage <= 100),
  school_percentage NUMERIC(5,2) NOT NULL DEFAULT 80.00 
    CHECK (school_percentage >= 0 AND school_percentage <= 100),
  
  -- Optional: Which providers this split applies to
  applies_to_providers TEXT[] DEFAULT ARRAY['stripe'],
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT revenue_split_total CHECK (platform_percentage + school_percentage = 100),
  CONSTRAINT revenue_splits_tenant_unique UNIQUE (tenant_id)
);

-- Indexes
CREATE INDEX idx_revenue_splits_tenant ON revenue_splits(tenant_id);

-- RLS Policies
ALTER TABLE revenue_splits ENABLE ROW LEVEL SECURITY;

-- Admins can view their tenant's split
CREATE POLICY "Admins can view own revenue split" ON revenue_splits
  FOR SELECT
  USING (
    tenant_id = public.get_tenant_id() OR public.is_super_admin()
  );

-- Only super admins can modify splits
CREATE POLICY "Super admins can update revenue splits" ON revenue_splits
  FOR UPDATE
  USING (public.is_super_admin());

CREATE POLICY "Super admins can insert revenue splits" ON revenue_splits
  FOR INSERT
  WITH CHECK (public.is_super_admin());

-- Comment
COMMENT ON TABLE revenue_splits IS 'Defines revenue split between platform and school per tenant';

-- =====================================================
-- 2. PAYOUTS TABLE
-- Tracks payouts to schools from platform
-- =====================================================

CREATE TABLE IF NOT EXISTS payouts (
  payout_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Payout details
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'usd',
  
  -- Status workflow: pending → processing → paid → failed
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  
  -- Stripe Connect payout ID
  stripe_payout_id VARCHAR(255) UNIQUE,
  
  -- Time period this payout covers
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  -- Additional metadata
  stripe_metadata JSONB,
  failure_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT payouts_tenant_period UNIQUE (tenant_id, period_start, period_end),
  CONSTRAINT payouts_period_order CHECK (period_start < period_end)
);

-- Indexes
CREATE INDEX idx_payouts_tenant ON payouts(tenant_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_stripe_id ON payouts(stripe_payout_id) WHERE stripe_payout_id IS NOT NULL;
CREATE INDEX idx_payouts_period ON payouts(period_start, period_end);

-- RLS Policies
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

-- Admins can view their tenant's payouts
CREATE POLICY "Admins can view own payouts" ON payouts
  FOR SELECT
  USING (
    tenant_id = public.get_tenant_id() OR public.is_super_admin()
  );

-- Super admins can manage all payouts
CREATE POLICY "Super admins can insert payouts" ON payouts
  FOR INSERT
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update payouts" ON payouts
  FOR UPDATE
  USING (public.is_super_admin());

-- Comment
COMMENT ON TABLE payouts IS 'Tracks payouts from platform to schools for revenue sharing';

-- =====================================================
-- 3. INVOICES TABLE
-- Student-facing receipts for purchases
-- =====================================================

CREATE TABLE IF NOT EXISTS invoices (
  invoice_id SERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id INTEGER REFERENCES transactions(transaction_id) ON DELETE SET NULL,
  
  -- Invoice details
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  tax_amount NUMERIC(10,2) DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  currency VARCHAR(3) DEFAULT 'usd',
  
  -- Status: draft → sent → paid → void
  status VARCHAR(50) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void', 'refunded')),
  
  -- Invoice file
  pdf_url TEXT,
  
  -- Payment tracking
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT invoices_total_check CHECK (total_amount = amount + tax_amount)
);

-- Indexes
CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_user ON invoices(user_id);
CREATE INDEX idx_invoices_transaction ON invoices(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_status ON invoices(status);

-- RLS Policies
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Users can view their own invoices
CREATE POLICY "Users can view own invoices" ON invoices
  FOR SELECT
  USING (
    auth.uid() = user_id OR
    (tenant_id = public.get_tenant_id() AND public.get_tenant_role() IN ('admin', 'teacher')) OR
    public.is_super_admin()
  );

-- Admins can create/update invoices for their tenant
CREATE POLICY "Admins can insert invoices" ON invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = public.get_tenant_id() OR public.is_super_admin()
  );

CREATE POLICY "Admins can update invoices" ON invoices
  FOR UPDATE
  USING (
    tenant_id = public.get_tenant_id() OR public.is_super_admin()
  );

-- Comment
COMMENT ON TABLE invoices IS 'Student-facing invoices/receipts for course purchases';

-- =====================================================
-- 4. UPDATED_AT TRIGGERS
-- =====================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to revenue_splits
CREATE TRIGGER update_revenue_splits_updated_at
  BEFORE UPDATE ON revenue_splits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply to invoices
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 5. INSERT DEFAULT REVENUE SPLITS FOR EXISTING TENANTS
-- =====================================================

-- Insert 80/20 split for all existing tenants
INSERT INTO revenue_splits (tenant_id, platform_percentage, school_percentage, applies_to_providers)
SELECT 
  id,
  20.00,  -- Platform gets 20%
  80.00,  -- School gets 80%
  ARRAY['stripe']
FROM tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- =====================================================
-- 6. HELPER VIEWS AND FUNCTIONS FOR ANALYTICS
-- NOTE: revenue_summary view and transaction-based functions
-- will be added once tenant_id is added to the transactions table.
-- =====================================================

-- Calculate pending payout for a tenant (based on payouts only for now)
CREATE OR REPLACE FUNCTION calculate_pending_payout(
  p_tenant_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_total_paid_out NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid_out
  FROM payouts
  WHERE tenant_id = p_tenant_id
    AND status = 'paid';

  RETURN GREATEST(0 - v_total_paid_out, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_pending_payout IS 'Calculates pending payout amount for a tenant';
