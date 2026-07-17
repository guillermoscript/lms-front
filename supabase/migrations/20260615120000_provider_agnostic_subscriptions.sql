-- Make the plan / subscription billing system provider-agnostic.
--
-- The product payment system (products table + products.ts) was already
-- refactored behind getPaymentProvider() with provider_product_id /
-- provider_price_id columns. The plan/subscription system was left
-- Stripe-hardcoded:
--   * plans still carried stripe_product_id / stripe_price_id columns
--   * subscriptions had no way to record WHICH provider owns a sub, nor the
--     provider's subscription identifier
--   * the Stripe webhook (customer.subscription.deleted / invoice.payment_failed)
--     queried subscriptions.stripe_subscription_id — a column that never existed,
--     so those handlers silently matched nothing.
--
-- This migration:
--   1. Renames the two plan ID columns to the provider-agnostic names that
--      plans.ts now writes (mirrors the products table). RENAME preserves any
--      existing Stripe IDs on plan rows.
--   2. Adds payment_provider + provider_subscription_id to subscriptions so the
--      webhook can look a row up by (provider_subscription_id, payment_provider).
--   3. Adds a partial index for that lookup.
--
-- Existing subscription rows default to payment_provider = 'manual' (the issue's
-- chosen default): today every student subscription is created by the
-- handle_new_subscription DB trigger with no Stripe Subscription object, so none
-- of them are Stripe-managed recurring subs. subscription_id 15 (Code Academy
-- Pro, manual) is therefore unaffected.

-- 1. plans: stripe_* -> provider_* (idempotent; RENAME has no IF EXISTS)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans'
      AND column_name = 'stripe_product_id'
  ) THEN
    ALTER TABLE public.plans RENAME COLUMN stripe_product_id TO provider_product_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plans'
      AND column_name = 'stripe_price_id'
  ) THEN
    ALTER TABLE public.plans RENAME COLUMN stripe_price_id TO provider_price_id;
  END IF;
END $$;

-- 2. subscriptions: record provider + provider sub id
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_provider         TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS provider_subscription_id TEXT;

-- 3. lookup index for webhook matching (only rows that carry a provider sub id)
CREATE INDEX IF NOT EXISTS idx_subscriptions_provider_subscription_id
  ON public.subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
