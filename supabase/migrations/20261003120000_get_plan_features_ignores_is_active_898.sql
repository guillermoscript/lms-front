-- #898: `get_plan_features` reads a tenant's plan the way every other gate does.
--
-- The RPC used to look the plan up with `AND pp.is_active = true` and fall back
-- to the `free` row when that found nothing. Every other reader resolves
-- `tenants.plan` → `platform_plans` by slug with NO `is_active` filter —
-- `getTenantPlan()` in lib/plans/server.ts and `tenant_plan_limit()` /
-- `get_tenant_plan_usage()` (20260901120000) — because retiring a plan must not
-- change what its subscribers may do. A tenant on a retired or hidden plan
-- (including the plan-gate E2E fixtures' hidden rows) therefore got Free's
-- features and limits from this RPC and its real plan from everything else:
-- the MCP theme tool refused a custom colour the web allowed, and
-- `lms_get_plan_usage` printed Free's limits next to the real plan's caps.
--
-- The free-row fallback stays for a slug with no `platform_plans` row at all
-- (the client hook `usePlanFeatures()` expects a populated payload). The body
-- is otherwise unchanged; `search_path` is now pinned like every other
-- SECURITY DEFINER function. CREATE OR REPLACE keeps the existing grants.

CREATE OR REPLACE FUNCTION public.get_plan_features(_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _plan_slug varchar;
  _result jsonb;
BEGIN
  SELECT plan INTO _plan_slug FROM public.tenants WHERE id = _tenant_id;
  _plan_slug := COALESCE(_plan_slug, 'free');

  -- No is_active filter: a retired plan still governs its subscribers.
  SELECT jsonb_build_object(
    'plan', pp.slug,
    'plan_name', pp.name,
    'features', pp.features,
    'limits', pp.limits,
    'transaction_fee_percent', pp.transaction_fee_percent
  ) INTO _result
  FROM public.platform_plans pp
  WHERE pp.slug = _plan_slug;

  -- Only a slug with no row at all falls back to the free plan.
  IF _result IS NULL THEN
    SELECT jsonb_build_object(
      'plan', pp.slug,
      'plan_name', pp.name,
      'features', pp.features,
      'limits', pp.limits,
      'transaction_fee_percent', pp.transaction_fee_percent
    ) INTO _result
    FROM public.platform_plans pp
    WHERE pp.slug = 'free';
  END IF;

  RETURN COALESCE(_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_plan_features(uuid) IS
  'Plan slug, name, features, limits and fee for a tenant, resolved through tenants.plan → platform_plans with no is_active filter (a retired plan still governs its subscribers). Falls back to the free row only when the slug has no row. #898.';
