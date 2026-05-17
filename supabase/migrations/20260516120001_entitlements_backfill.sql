-- Phase 1 / Migration B — Backfill `entitlements` from existing `enrollments`.
-- See docs/ENTITLEMENTS_MIGRATION_PLAN.md
--
-- Idempotent: ON CONFLICT DO NOTHING. Safe to re-run.

-- Product-based enrollments -> perpetual product entitlements
INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, granted_at, expires_at)
SELECT
  e.user_id,
  e.course_id,
  e.tenant_id,
  'product'::entitlement_source,
  e.product_id,
  CASE WHEN e.status = 'disabled' THEN 'revoked' ELSE 'active' END::entitlement_status,
  COALESCE(e.enrollment_date, now()),
  NULL
FROM enrollments e
WHERE e.product_id IS NOT NULL
ON CONFLICT ON CONSTRAINT entitlements_unique_source DO NOTHING;

-- Subscription-based enrollments -> subscription entitlements (expire with the sub)
INSERT INTO entitlements (user_id, course_id, tenant_id, source_type, source_id, status, granted_at, expires_at)
SELECT
  e.user_id,
  e.course_id,
  e.tenant_id,
  'subscription'::entitlement_source,
  e.subscription_id,
  CASE WHEN e.status = 'disabled' THEN 'expired' ELSE 'active' END::entitlement_status,
  COALESCE(e.enrollment_date, now()),
  s.end_date
FROM enrollments e
JOIN subscriptions s ON s.subscription_id = e.subscription_id
WHERE e.subscription_id IS NOT NULL
ON CONFLICT ON CONSTRAINT entitlements_unique_source DO NOTHING;
