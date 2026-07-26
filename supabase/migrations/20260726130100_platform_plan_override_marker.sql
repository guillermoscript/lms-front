-- Issue #546 §3 — forceTenantPlanChange on a live Stripe subscriber bills the
-- school for the comped plan.
--
-- The super-admin override rewrites platform_subscriptions.plan_id and never
-- touches Stripe, so the next customer.subscription.updated maps Stripe's
-- (unchanged, real) price to the real plan, misses applyPortalPlanChange's
-- no-op guard, reads it as a downgrade, finds the tenant over the real plan's
-- limits — which is why it was comped — and "reverts" Stripe onto the FORCED
-- plan's price. The school then pays for the plan it was given for free.
--
-- Mark the override so the reconciler can recognise a comped tenant and leave
-- its Stripe subscription alone. Cleared whenever the tenant's plan is set by a
-- real payment path (confirmManualPayment / changePlan) or by a super admin
-- calling clearTenantPlanOverride — that is the override's exit.

ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS plan_override_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS plan_override_at TIMESTAMPTZ;

COMMENT ON COLUMN platform_subscriptions.plan_override_at IS
  'Set when a super admin forces this tenant onto a plan without changing Stripe. '
  'While non-NULL, applyPortalPlanChange ignores portal price changes for this '
  'tenant so the comped plan is never pushed onto the real Stripe subscription. '
  'Cleared by confirmManualPayment, changePlan and clearTenantPlanOverride.';

COMMENT ON COLUMN platform_subscriptions.plan_override_by IS
  'auth.users.id of the super admin who applied the plan override.';

-- Small table; a partial index keeps the "who is comped" lookup cheap for the
-- platform panel without paying for the common NULL case.
CREATE INDEX IF NOT EXISTS idx_platform_subscriptions_plan_override
  ON platform_subscriptions (plan_override_at)
  WHERE plan_override_at IS NOT NULL;
