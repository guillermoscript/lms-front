-- Fix get_gamification_features: it gated gamification features off the wrong plan slugs.
--
-- The old CASE matched 'professional' / 'basic', but the canonical platform_plans
-- slugs are free / starter / pro / business / enterprise. Every tenant on pro,
-- starter, or business therefore fell through to the ELSE branch and had
-- leaderboard / achievements / store wrongly reported as locked — so paying
-- schools' students saw "Upgrade to Professional" on features they already own.
--
-- It also hardcoded the feature tiers instead of reading platform_plans.features,
-- the authoritative source used by get_plan_features(). Fix: resolve the plan the
-- same way get_plan_features() does and read store / leaderboard / achievements
-- straight from platform_plans.features so the two functions can never drift.

CREATE OR REPLACE FUNCTION public.get_gamification_features(_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  _plan_slug VARCHAR;
  _features JSONB;
BEGIN
  -- Resolve the tenant's plan slug (same path as get_plan_features)
  SELECT plan INTO _plan_slug FROM tenants WHERE id = _tenant_id;
  _plan_slug := COALESCE(_plan_slug, 'free');

  -- Pull the authoritative feature flags for that plan
  SELECT pp.features INTO _features
  FROM platform_plans pp
  WHERE pp.slug = _plan_slug AND pp.is_active = true;

  IF _features IS NULL THEN
    SELECT pp.features INTO _features FROM platform_plans pp WHERE pp.slug = 'free';
  END IF;

  RETURN jsonb_build_object(
    -- xp / levels / streaks ship on every plan, including free
    'xp', true,
    'levels', true,
    'streaks', true,
    'leaderboard', COALESCE((_features ->> 'leaderboard')::boolean, false),
    'achievements', COALESCE((_features ->> 'achievements')::boolean, false),
    'store', COALESCE((_features ->> 'store')::boolean, false),
    -- custom gamification content unlocks at pro and above
    'custom_achievements', _plan_slug IN ('pro', 'business', 'enterprise'),
    'custom_store', _plan_slug IN ('pro', 'business', 'enterprise')
  );
END;
$function$;
