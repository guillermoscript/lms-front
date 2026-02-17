-- Platform Billing: Plan definitions, subscriptions, and manual payment requests
-- This is for school-level billing (schools pay the platform), separate from student payments

-- ============================================================================
-- 1. Platform Plans — defines available tiers with features/limits
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_plans (
  plan_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            VARCHAR(50) NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  description     TEXT,
  price_monthly   NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly    NUMERIC(10,2) NOT NULL DEFAULT 0,
  stripe_price_id_monthly VARCHAR(255),
  stripe_price_id_yearly  VARCHAR(255),
  features        JSONB NOT NULL DEFAULT '{}'::jsonb,
  limits          JSONB NOT NULL DEFAULT '{}'::jsonb,
  transaction_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. Platform Subscriptions — tracks each school's billing
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_subscriptions (
  subscription_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id               UUID NOT NULL REFERENCES platform_plans(plan_id),
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id    VARCHAR(255),
  status                VARCHAR(50) NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'past_due', 'canceled', 'trialing', 'incomplete', 'incomplete_expired', 'unpaid')),
  payment_method        VARCHAR(50) NOT NULL DEFAULT 'stripe'
                          CHECK (payment_method IN ('stripe', 'manual_transfer')),
  interval              VARCHAR(20) NOT NULL DEFAULT 'monthly'
                          CHECK (interval IN ('monthly', 'yearly')),
  current_period_start  TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN DEFAULT false,
  canceled_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT platform_subscriptions_tenant_unique UNIQUE (tenant_id)
);

-- ============================================================================
-- 3. Platform Payment Requests — manual bank transfer for plan upgrades
-- ============================================================================
CREATE TABLE IF NOT EXISTS platform_payment_requests (
  request_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES platform_plans(plan_id),
  requested_by  UUID NOT NULL REFERENCES auth.users(id),
  interval      VARCHAR(20) NOT NULL DEFAULT 'monthly'
                  CHECK (interval IN ('monthly', 'yearly')),
  amount        NUMERIC(10,2) NOT NULL,
  currency      VARCHAR(3) NOT NULL DEFAULT 'usd',
  status        VARCHAR(50) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'instructions_sent', 'payment_received', 'confirmed', 'rejected', 'expired')),
  bank_reference VARCHAR(255),
  notes         TEXT,
  confirmed_by  UUID REFERENCES auth.users(id),
  confirmed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. Alter tenants table — add billing columns
-- ============================================================================
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(50) DEFAULT 'free';

-- ============================================================================
-- 5. Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_platform_plans_slug ON platform_plans(slug);
CREATE INDEX IF NOT EXISTS idx_platform_plans_active ON platform_plans(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_tenant ON platform_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_stripe ON platform_subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_tenant ON platform_payment_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_status ON platform_payment_requests(status);

-- ============================================================================
-- 6. RLS Policies
-- ============================================================================
ALTER TABLE platform_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_payment_requests ENABLE ROW LEVEL SECURITY;

-- Platform plans: anyone can read active plans
CREATE POLICY "Anyone can read active platform plans"
  ON platform_plans FOR SELECT
  USING (is_active = true);

-- Super admins can manage plans
CREATE POLICY "Super admins can manage platform plans"
  ON platform_plans FOR ALL
  USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
  );

-- Platform subscriptions: tenant admins can read their own
CREATE POLICY "Tenant admins can view own subscription"
  ON platform_subscriptions FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Super admins can manage all subscriptions
CREATE POLICY "Super admins can manage platform subscriptions"
  ON platform_subscriptions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
  );

-- Platform payment requests: tenant admins can manage their own
CREATE POLICY "Tenant admins can view own payment requests"
  ON platform_payment_requests FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

CREATE POLICY "Tenant admins can create payment requests"
  ON platform_payment_requests FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

-- Super admins can manage all payment requests
CREATE POLICY "Super admins can manage platform payment requests"
  ON platform_payment_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
  );

-- ============================================================================
-- 7. Seed platform plans
-- ============================================================================
INSERT INTO platform_plans (slug, name, description, price_monthly, price_yearly, transaction_fee_percent, sort_order, features, limits) VALUES
(
  'free',
  'Free',
  'Get started with basic features',
  0, 0,
  10.00,
  0,
  '{"leaderboard": false, "achievements": false, "store": false, "certificates": "basic", "analytics": false, "ai_grading": false, "custom_branding": false, "custom_domain": false, "api_access": false, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true}'::jsonb,
  '{"max_courses": 5, "max_students": 50}'::jsonb
),
(
  'starter',
  'Starter',
  'For growing schools that need more capacity',
  9, 90,
  5.00,
  1,
  '{"leaderboard": true, "achievements": true, "store": false, "certificates": "custom", "analytics": "basic", "ai_grading": false, "custom_branding": false, "custom_domain": false, "api_access": false, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true}'::jsonb,
  '{"max_courses": 15, "max_students": 200}'::jsonb
),
(
  'pro',
  'Pro',
  'Advanced features for professional educators',
  29, 290,
  2.00,
  2,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": false, "custom_domain": false, "api_access": false, "white_label": false, "priority_support": false, "xp": true, "levels": true, "streaks": true}'::jsonb,
  '{"max_courses": 100, "max_students": 1000}'::jsonb
),
(
  'business',
  'Business',
  'Full platform with custom branding and priority support',
  79, 790,
  0,
  3,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": true, "custom_domain": true, "api_access": false, "white_label": false, "priority_support": true, "xp": true, "levels": true, "streaks": true}'::jsonb,
  '{"max_courses": -1, "max_students": 5000}'::jsonb
),
(
  'enterprise',
  'Enterprise',
  'Unlimited everything with white-label and API access',
  199, 1990,
  0,
  4,
  '{"leaderboard": true, "achievements": true, "store": true, "certificates": "custom", "analytics": "advanced", "ai_grading": true, "custom_branding": true, "custom_domain": true, "api_access": true, "white_label": true, "priority_support": true, "xp": true, "levels": true, "streaks": true}'::jsonb,
  '{"max_courses": -1, "max_students": -1}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- 8. Helper function to get plan features for a tenant
-- ============================================================================
CREATE OR REPLACE FUNCTION get_plan_features(_tenant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  _plan_slug VARCHAR;
  _result JSONB;
BEGIN
  -- Get tenant's current plan
  SELECT plan INTO _plan_slug FROM tenants WHERE id = _tenant_id;
  _plan_slug := COALESCE(_plan_slug, 'free');

  -- Look up from platform_plans
  SELECT jsonb_build_object(
    'plan', pp.slug,
    'plan_name', pp.name,
    'features', pp.features,
    'limits', pp.limits,
    'transaction_fee_percent', pp.transaction_fee_percent
  ) INTO _result
  FROM platform_plans pp
  WHERE pp.slug = _plan_slug AND pp.is_active = true;

  -- Fallback to free plan if not found
  IF _result IS NULL THEN
    SELECT jsonb_build_object(
      'plan', pp.slug,
      'plan_name', pp.name,
      'features', pp.features,
      'limits', pp.limits,
      'transaction_fee_percent', pp.transaction_fee_percent
    ) INTO _result
    FROM platform_plans pp
    WHERE pp.slug = 'free';
  END IF;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;
