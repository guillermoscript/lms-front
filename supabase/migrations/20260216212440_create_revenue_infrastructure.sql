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
    tenant_id = auth.tenant_id() OR auth.is_super_admin()
  );

-- Only super admins can modify splits
CREATE POLICY "Super admins can update revenue splits" ON revenue_splits
  FOR UPDATE
  USING (auth.is_super_admin());

CREATE POLICY "Super admins can insert revenue splits" ON revenue_splits
  FOR INSERT
  WITH CHECK (auth.is_super_admin());

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
    tenant_id = auth.tenant_id() OR auth.is_super_admin()
  );

-- Super admins can manage all payouts
CREATE POLICY "Super admins can insert payouts" ON payouts
  FOR INSERT
  WITH CHECK (auth.is_super_admin());

CREATE POLICY "Super admins can update payouts" ON payouts
  FOR UPDATE
  USING (auth.is_super_admin());

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
    (tenant_id = auth.tenant_id() AND auth.tenant_role() IN ('admin', 'teacher')) OR
    auth.is_super_admin()
  );

-- Admins can create/update invoices for their tenant
CREATE POLICY "Admins can insert invoices" ON invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = auth.tenant_id() OR auth.is_super_admin()
  );

CREATE POLICY "Admins can update invoices" ON invoices
  FOR UPDATE
  USING (
    tenant_id = auth.tenant_id() OR auth.is_super_admin()
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
-- 6. HELPER VIEWS FOR ANALYTICS
-- =====================================================

-- View: Revenue summary per tenant
CREATE OR REPLACE VIEW revenue_summary AS
SELECT 
  t.id as tenant_id,
  t.name as tenant_name,
  t.plan,
  rs.platform_percentage,
  rs.school_percentage,
  COUNT(DISTINCT tr.transaction_id) as total_transactions,
  COALESCE(SUM(CASE WHEN tr.status = 'successful' THEN tr.amount ELSE 0 END), 0) as total_revenue,
  COALESCE(SUM(CASE WHEN tr.status = 'successful' THEN tr.amount * (rs.school_percentage / 100) ELSE 0 END), 0) as school_revenue,
  COALESCE(SUM(CASE WHEN tr.status = 'successful' THEN tr.amount * (rs.platform_percentage / 100) ELSE 0 END), 0) as platform_revenue,
  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as total_paid_out,
  COALESCE(SUM(CASE WHEN tr.status = 'successful' THEN tr.amount * (rs.school_percentage / 100) ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) as pending_payout
FROM tenants t
LEFT JOIN revenue_splits rs ON rs.tenant_id = t.id
LEFT JOIN transactions tr ON tr.tenant_id = t.id
LEFT JOIN payouts p ON p.tenant_id = t.id
GROUP BY t.id, t.name, t.plan, rs.platform_percentage, rs.school_percentage;

COMMENT ON VIEW revenue_summary IS 'Revenue analytics per tenant including splits and payouts';

-- =====================================================
-- 7. FUNCTIONS FOR REVENUE CALCULATIONS
-- =====================================================

-- Calculate school's share of a transaction
CREATE OR REPLACE FUNCTION calculate_school_revenue(
  p_transaction_id INTEGER
)
RETURNS NUMERIC AS $$
DECLARE
  v_amount NUMERIC;
  v_tenant_id UUID;
  v_school_percentage NUMERIC;
BEGIN
  -- Get transaction details
  SELECT amount, tenant_id 
  INTO v_amount, v_tenant_id
  FROM transactions
  WHERE transaction_id = p_transaction_id;

  -- Get revenue split
  SELECT school_percentage
  INTO v_school_percentage
  FROM revenue_splits
  WHERE tenant_id = v_tenant_id;

  -- Return school's share
  RETURN v_amount * (COALESCE(v_school_percentage, 80) / 100);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_school_revenue IS 'Calculates school revenue from a transaction based on split';

-- Calculate pending payout for a tenant
CREATE OR REPLACE FUNCTION calculate_pending_payout(
  p_tenant_id UUID
)
RETURNS NUMERIC AS $$
DECLARE
  v_total_school_revenue NUMERIC;
  v_total_paid_out NUMERIC;
BEGIN
  -- Calculate total school revenue from successful transactions
  SELECT COALESCE(SUM(
    tr.amount * (rs.school_percentage / 100)
  ), 0)
  INTO v_total_school_revenue
  FROM transactions tr
  JOIN revenue_splits rs ON rs.tenant_id = tr.tenant_id
  WHERE tr.tenant_id = p_tenant_id
    AND tr.status = 'successful';

  -- Calculate total already paid out
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid_out
  FROM payouts
  WHERE tenant_id = p_tenant_id
    AND status = 'paid';

  -- Return difference
  RETURN GREATEST(v_total_school_revenue - v_total_paid_out, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_pending_payout IS 'Calculates pending payout amount for a tenant';
