-- Platform billing: make the school -> platform loop provider-agnostic (issue #601).
--
-- 20260217040000_platform_billing.sql modelled school billing around one provider's
-- primitives: the provider lives in column NAMES (stripe_price_id_*, stripe_subscription_id,
-- stripe_customer_id) and `payment_method` is a two-value enum standing where the student
-- half already uses the 8-value PaymentProvider slug (lib/payments/types.ts:6).
--
-- The student-side tables were fixed this way by #280 -- `subscriptions` uses
-- (payment_provider, provider_subscription_id) and `plans` uses
-- (payment_provider, provider_price_id). Platform billing now reads identically.
--
-- Pre-launch project (#540 standing note): drop and recreate, no backfill dances,
-- no compatibility shims, no phased rollout. The only rows that exist are seed rows.
--
-- `tenants.stripe_account_id` is deliberately untouched -- that is Stripe *Connect*
-- (student -> school), a different loop with a different meaning.

-- ============================================================================
-- 1. platform_plan_prices -- one row per (plan, provider, interval)
-- ============================================================================
-- `payment_provider` is a CHECKed text column rather than a Postgres enum, matching
-- how subscriptions.payment_provider / plans.payment_provider are already typed on
-- the student side: adding a 9th provider stays a one-line CHECK edit.
CREATE TABLE IF NOT EXISTS platform_plan_prices (
  price_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID NOT NULL REFERENCES platform_plans(plan_id) ON DELETE CASCADE,
  payment_provider  TEXT NOT NULL
                      CHECK (payment_provider IN (
                        'stripe', 'paypal', 'binance', 'binance_personal',
                        'manual', 'lemonsqueezy', 'solana', 'solana_subs'
                      )),
  interval          TEXT NOT NULL
                      CHECK (interval IN ('monthly', 'yearly')),
  provider_price_id TEXT NOT NULL,
  currency          currency_type NOT NULL DEFAULT 'usd',
  -- What the provider actually charges. May differ from platform_plans.price_monthly
  -- on non-USD rails, so the checkout amount is read from here, not derived.
  amount            NUMERIC(10,2),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT platform_plan_prices_unique UNIQUE (plan_id, payment_provider, interval)
);

CREATE INDEX IF NOT EXISTS idx_platform_plan_prices_plan
  ON platform_plan_prices(plan_id, is_active);
CREATE INDEX IF NOT EXISTS idx_platform_plan_prices_provider_price
  ON platform_plan_prices(payment_provider, provider_price_id);

ALTER TABLE platform_plan_prices ENABLE ROW LEVEL SECURITY;

-- Mirrors the platform_plans policies: the upgrade page needs to read active prices,
-- only super admins may write them.
CREATE POLICY "Anyone can read active platform plan prices"
  ON platform_plan_prices FOR SELECT
  USING (is_active = true);

CREATE POLICY "Super admins can manage platform plan prices"
  ON platform_plan_prices FOR ALL
  USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
  );

-- Read by three call sites, written by none (#602) -- nothing to preserve.
ALTER TABLE platform_plans
  DROP COLUMN IF EXISTS stripe_price_id_monthly,
  DROP COLUMN IF EXISTS stripe_price_id_yearly;

-- ============================================================================
-- 2. platform_subscriptions -- provider-shaped identifiers
-- ============================================================================
ALTER TABLE platform_subscriptions
  RENAME COLUMN stripe_subscription_id TO provider_subscription_id;

ALTER TABLE platform_subscriptions
  RENAME COLUMN stripe_customer_id TO provider_customer_id;

ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'stripe';

-- Fold the old two-value enum into the provider slug: 'manual_transfer' -> 'manual'
-- so `manual` stops being a dimension parallel to the provider and becomes one of
-- its values. Every downstream branch then compares a single column.
UPDATE platform_subscriptions
SET payment_provider = CASE
  WHEN payment_method = 'manual_transfer' THEN 'manual'
  ELSE 'stripe'
END;

ALTER TABLE platform_subscriptions
  DROP COLUMN IF EXISTS payment_method;

ALTER TABLE platform_subscriptions
  ADD CONSTRAINT platform_subscriptions_payment_provider_check
    CHECK (payment_provider IN (
      'stripe', 'paypal', 'binance', 'binance_personal',
      'manual', 'lemonsqueezy', 'solana', 'solana_subs'
    ));

DROP INDEX IF EXISTS idx_platform_subscriptions_stripe;
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_provider
  ON platform_subscriptions(payment_provider, provider_subscription_id);

-- ============================================================================
-- 3. tenant_billing_customers -- one customer id per (tenant, provider)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_billing_customers (
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_provider     TEXT NOT NULL
                         CHECK (payment_provider IN (
                           'stripe', 'paypal', 'binance', 'binance_personal',
                           'manual', 'lemonsqueezy', 'solana', 'solana_subs'
                         )),
  provider_customer_id TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tenant_billing_customers_pkey PRIMARY KEY (tenant_id, payment_provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_customers_provider_customer
  ON tenant_billing_customers(payment_provider, provider_customer_id);

ALTER TABLE tenant_billing_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admins can view own billing customers"
  ON tenant_billing_customers FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM tenant_users
      WHERE user_id = auth.uid() AND role = 'admin' AND status = 'active'
    )
  );

CREATE POLICY "Super admins can manage tenant billing customers"
  ON tenant_billing_customers FOR ALL
  USING (
    EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid())
  );

-- The provider is now a value in tenant_billing_customers, not a column name here.
ALTER TABLE tenants
  DROP COLUMN IF EXISTS stripe_customer_id;
