-- =============================================================================
-- Weekly leagues + streak saver (issue #394, epic #388)
--
-- Implements learning-science finding #5 (retention gamification): tenant-scoped
-- weekly league cohorts (~20-30 students of similar recent engagement) with
-- promotion/demotion, plus streak-freeze consumption (the streak_freeze store
-- item granted `streak_freezes_available` but nothing ever consumed it).
--
-- Design notes:
-- * league_memberships RLS is own-rows-only; cohort standings are exposed ONLY
--   through the SECURITY DEFINER get_league_standings() RPC, which scopes to the
--   caller's cohort. This avoids self-referencing-policy recursion and enforces
--   "students see only their own cohort".
-- * Weekly XP is aggregated live from gamification_xp_transactions (same source
--   the get-leaderboard edge function uses); no counters to maintain.
-- * Weeks start Monday (date_trunc('week', ...)), matching get-leaderboard.
-- * Rollover is idempotent per (tenant, week) and skips: tenants whose plan
--   lacks the leaderboard feature, tenants disabled via tenant_settings key
--   'leagues' ({"enabled": false}), and tenants under min_students (default 10,
--   overridable via the same setting) — the cold-start guard.
-- =============================================================================

-- =============================================================================
-- STEP 1: Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.league_tiers (
  tier INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  promote_count INTEGER NOT NULL DEFAULT 5,
  demote_count INTEGER NOT NULL DEFAULT 5
);

INSERT INTO public.league_tiers (tier, slug, name, promote_count, demote_count) VALUES
  (1, 'bronze',   'Bronze',   5, 5),
  (2, 'silver',   'Silver',   5, 5),
  (3, 'gold',     'Gold',     5, 5),
  (4, 'sapphire', 'Sapphire', 5, 5),
  (5, 'ruby',     'Ruby',     5, 5)
ON CONFLICT (tier) DO NOTHING;

ALTER TABLE public.league_tiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view league tiers" ON public.league_tiers;
CREATE POLICY "Anyone can view league tiers"
  ON public.league_tiers FOR SELECT
  USING (true);

CREATE TABLE IF NOT EXISTS public.league_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  tier INTEGER NOT NULL REFERENCES public.league_tiers(tier),
  cohort_id UUID NOT NULL,
  final_rank INTEGER,
  movement TEXT CHECK (movement IN ('promoted', 'demoted', 'stayed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_memberships_user_week_unique UNIQUE (tenant_id, user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_league_memberships_tenant_week_cohort
  ON public.league_memberships (tenant_id, week_start, cohort_id);
CREATE INDEX IF NOT EXISTS idx_league_memberships_user
  ON public.league_memberships (user_id, week_start);

ALTER TABLE public.league_memberships ENABLE ROW LEVEL SECURITY;
-- Own rows only. Cohort visibility goes through get_league_standings() (SECURITY
-- DEFINER), never through the base table. No INSERT/UPDATE/DELETE policies:
-- writes happen only via the rollover functions / service role.
DROP POLICY IF EXISTS "Users can view own league memberships" ON public.league_memberships;
CREATE POLICY "Users can view own league memberships"
  ON public.league_memberships FOR SELECT
  USING (user_id = auth.uid() AND tenant_id = get_tenant_id());

-- Student anti-toxicity opt-out (issue #394 acceptance criteria)
ALTER TABLE public.gamification_profiles
  ADD COLUMN IF NOT EXISTS leagues_opt_out BOOLEAN NOT NULL DEFAULT false;

-- =============================================================================
-- STEP 2: Streak saver — award_xp() consumes freezes on missed days
-- Full re-create from the 20260217030000 definition; the only change is the
-- streak-broken branch (+ freeze bookkeeping in DECLARE/SELECT/UPDATE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.award_xp(
  _user_id UUID,
  _action_type TEXT,
  _xp_amount INT,
  _reference_id TEXT DEFAULT NULL,
  _reference_type TEXT DEFAULT NULL,
  _tenant_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id UUID;
  v_today DATE := CURRENT_DATE;
  v_last_activity DATE;
  v_current_streak INT;
  v_longest_streak INT;
  v_new_total_xp INT;
  v_new_level INT;
  v_freezes INT;
  v_missed INT;
  v_freezes_used INT := 0;
BEGIN
  -- Resolve tenant_id: parameter > JWT > default
  v_tenant_id := COALESCE(
    _tenant_id,
    (current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  -- Insert XP transaction
  INSERT INTO gamification_xp_transactions (user_id, action_type, xp_amount, reference_id, reference_type, tenant_id)
  VALUES (_user_id, _action_type, _xp_amount, _reference_id, _reference_type, v_tenant_id);

  -- Upsert gamification profile keyed on (user_id, tenant_id)
  INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level, current_streak, longest_streak, last_activity_date, updated_at)
  VALUES (_user_id, v_tenant_id, _xp_amount, 1, 1, 1, v_today, NOW())
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET
    total_xp = gamification_profiles.total_xp + _xp_amount,
    updated_at = NOW();

  -- Get current profile state
  SELECT total_xp, last_activity_date, current_streak, longest_streak, streak_freezes_available
  INTO v_new_total_xp, v_last_activity, v_current_streak, v_longest_streak, v_freezes
  FROM gamification_profiles
  WHERE user_id = _user_id AND tenant_id = v_tenant_id;

  -- Update streak logic
  IF v_last_activity IS NULL OR v_last_activity < v_today THEN
    IF v_last_activity = v_today - INTERVAL '1 day' THEN
      -- Consecutive day
      v_current_streak := COALESCE(v_current_streak, 0) + 1;
    ELSIF v_last_activity IS NULL THEN
      -- First activity
      v_current_streak := 1;
    ELSIF v_last_activity < v_today - INTERVAL '1 day' THEN
      v_missed := (v_today - v_last_activity) - 1;
      IF COALESCE(v_freezes, 0) >= v_missed THEN
        -- Streak saver: one freeze covers exactly one missed day. Only applies
        -- when freezes cover ALL missed days; otherwise the streak resets and
        -- no freezes are consumed.
        v_current_streak := COALESCE(v_current_streak, 0) + 1;
        v_freezes_used := v_missed;
        -- 0-XP audit row so freeze usage is visible to users/support
        INSERT INTO gamification_xp_transactions (user_id, action_type, xp_amount, reference_id, reference_type, tenant_id)
        VALUES (_user_id, 'streak_freeze_used', 0, v_missed::text, 'streak_freeze', v_tenant_id);
      ELSE
        -- Streak broken
        v_current_streak := 1;
      END IF;
    END IF;

    IF v_current_streak > v_longest_streak THEN
      v_longest_streak := v_current_streak;
    END IF;

    UPDATE gamification_profiles
    SET current_streak = v_current_streak,
        longest_streak = v_longest_streak,
        last_activity_date = v_today,
        streak_freezes_available = GREATEST(COALESCE(streak_freezes_available, 0) - v_freezes_used, 0)
    WHERE user_id = _user_id AND tenant_id = v_tenant_id;
  END IF;

  -- Auto-level based on XP thresholds
  SELECT level INTO v_new_level
  FROM gamification_levels
  WHERE min_xp <= v_new_total_xp
  ORDER BY level DESC
  LIMIT 1;

  IF v_new_level IS NOT NULL THEN
    UPDATE gamification_profiles
    SET level = v_new_level
    WHERE user_id = _user_id AND tenant_id = v_tenant_id AND level < v_new_level;
  END IF;
END;
$$;

-- =============================================================================
-- STEP 3: get_gamification_features gains a 'leagues' flag (mirrors leaderboard)
-- Full re-create from the 20260530120000 definition.
-- =============================================================================

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
    -- leagues piggyback on the leaderboard plan feature
    'leagues', COALESCE((_features ->> 'leaderboard')::boolean, false),
    'achievements', COALESCE((_features ->> 'achievements')::boolean, false),
    'store', COALESCE((_features ->> 'store')::boolean, false),
    -- custom gamification content unlocks at pro and above
    'custom_achievements', _plan_slug IN ('pro', 'business', 'enterprise'),
    'custom_store', _plan_slug IN ('pro', 'business', 'enterprise')
  );
END;
$function$;

-- =============================================================================
-- STEP 4: League rollover
-- =============================================================================

CREATE OR REPLACE FUNCTION public.rollover_leagues(_tenant_id UUID, _week_start DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week DATE := COALESCE(_week_start, date_trunc('week', now())::date); -- Monday
  v_prev_week DATE;
  v_settings JSONB;
  v_enabled BOOLEAN;
  v_min INT;
  v_cohort_max INT;
  v_max_tier INT;
  v_count INT;
  v_inserted INT := 0;
BEGIN
  v_prev_week := v_week - 7;

  -- Idempotency: this week already assigned for this tenant
  IF EXISTS (
    SELECT 1 FROM league_memberships
    WHERE tenant_id = _tenant_id AND week_start = v_week
  ) THEN
    RETURN 0;
  END IF;

  -- Plan gate: leagues require the leaderboard feature
  IF NOT COALESCE((get_gamification_features(_tenant_id) ->> 'leagues')::boolean, false) THEN
    RETURN 0;
  END IF;

  -- Tenant-level settings (admin disable + cold-start threshold)
  SELECT setting_value INTO v_settings
  FROM tenant_settings
  WHERE tenant_id = _tenant_id AND setting_key = 'leagues';

  v_enabled := COALESCE((v_settings ->> 'enabled')::boolean, true);
  v_min := COALESCE((v_settings ->> 'min_students')::int, 10);
  v_cohort_max := COALESCE((v_settings ->> 'cohort_size')::int, 30);

  IF NOT v_enabled THEN
    RETURN 0;
  END IF;

  SELECT MAX(tier) INTO v_max_tier FROM league_tiers;

  -- ---------------------------------------------------------------------------
  -- Finalize the previous week: rank each cohort by weekly XP, mark movement
  -- ---------------------------------------------------------------------------
  WITH xp AS (
    SELECT m.id, m.cohort_id, m.tier,
           COALESCE(SUM(t.xp_amount), 0) AS wxp
    FROM league_memberships m
    LEFT JOIN gamification_xp_transactions t
      ON t.user_id = m.user_id
     AND t.tenant_id = m.tenant_id
     AND t.created_at >= v_prev_week
     AND t.created_at < v_week
    WHERE m.tenant_id = _tenant_id
      AND m.week_start = v_prev_week
      AND m.final_rank IS NULL
    GROUP BY m.id, m.cohort_id, m.tier
  ),
  ranked AS (
    SELECT id, tier, wxp,
           ROW_NUMBER() OVER (PARTITION BY cohort_id ORDER BY wxp DESC, id) AS rnk,
           COUNT(*) OVER (PARTITION BY cohort_id) AS csize
    FROM xp
  )
  UPDATE league_memberships m
  SET final_rank = r.rnk,
      movement = CASE
        WHEN r.rnk <= lt.promote_count AND m.tier < v_max_tier THEN 'promoted'
        WHEN r.rnk > GREATEST(r.csize - lt.demote_count, lt.promote_count) AND m.tier > 1 THEN 'demoted'
        ELSE 'stayed'
      END
  FROM ranked r
  JOIN league_tiers lt ON lt.tier = r.tier
  WHERE m.id = r.id;

  -- ---------------------------------------------------------------------------
  -- Eligibility: opted-in students with XP activity in the last 14 days
  -- ---------------------------------------------------------------------------
  DROP TABLE IF EXISTS tmp_league_eligible;
  CREATE TEMP TABLE tmp_league_eligible ON COMMIT DROP AS
  SELECT gp.user_id,
         COALESCE((
           SELECT SUM(t.xp_amount)
           FROM gamification_xp_transactions t
           WHERE t.user_id = gp.user_id
             AND t.tenant_id = _tenant_id
             AND t.created_at >= v_week - 14
         ), 0) AS recent_xp
  FROM gamification_profiles gp
  WHERE gp.tenant_id = _tenant_id
    AND gp.leagues_opt_out = false
    AND EXISTS (
      SELECT 1 FROM gamification_xp_transactions t2
      WHERE t2.user_id = gp.user_id
        AND t2.tenant_id = _tenant_id
        AND t2.created_at >= v_week - 14
    );

  SELECT COUNT(*) INTO v_count FROM tmp_league_eligible;

  -- Cold-start guard: no leagues for tiny tenants
  IF v_count < v_min THEN
    RETURN 0;
  END IF;

  -- ---------------------------------------------------------------------------
  -- New week's tier per student: previous tier +/- movement; new joiners at 1
  -- ---------------------------------------------------------------------------
  DROP TABLE IF EXISTS tmp_league_assign;
  CREATE TEMP TABLE tmp_league_assign ON COMMIT DROP AS
  SELECT e.user_id, e.recent_xp,
         COALESCE(
           CASE pm.movement
             WHEN 'promoted' THEN LEAST(pm.tier + 1, v_max_tier)
             WHEN 'demoted' THEN GREATEST(pm.tier - 1, 1)
             ELSE pm.tier
           END,
           1
         ) AS tier
  FROM tmp_league_eligible e
  LEFT JOIN league_memberships pm
    ON pm.tenant_id = _tenant_id
   AND pm.user_id = e.user_id
   AND pm.week_start = v_prev_week;

  -- ---------------------------------------------------------------------------
  -- Cohorts: within each tier, order by recent XP (similar engagement together)
  -- and split into balanced groups of <= v_cohort_max
  -- ---------------------------------------------------------------------------
  WITH counts AS (
    SELECT tier, COUNT(*) AS cnt,
           CEIL(COUNT(*)::numeric / v_cohort_max)::int AS n_cohorts
    FROM tmp_league_assign
    GROUP BY tier
  ),
  ranked AS (
    SELECT a.user_id, a.tier,
           ROW_NUMBER() OVER (PARTITION BY a.tier ORDER BY a.recent_xp DESC, a.user_id) AS rn
    FROM tmp_league_assign a
  ),
  bucketed AS (
    SELECT r.user_id, r.tier,
           (((r.rn - 1) * c.n_cohorts) / c.cnt) + 1 AS bucket
    FROM ranked r
    JOIN counts c USING (tier)
  ),
  cohort_ids AS (
    SELECT tier, bucket, gen_random_uuid() AS cohort_id
    FROM (SELECT DISTINCT tier, bucket FROM bucketed) db
  )
  INSERT INTO league_memberships (tenant_id, user_id, week_start, tier, cohort_id)
  SELECT _tenant_id, b.user_id, v_week, b.tier, ci.cohort_id
  FROM bucketed b
  JOIN cohort_ids ci USING (tier, bucket)
  ON CONFLICT (tenant_id, user_id, week_start) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollover_all_leagues(_week_start DATE DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant RECORD;
  v_total INT := 0;
BEGIN
  FOR v_tenant IN
    SELECT DISTINCT gp.tenant_id FROM gamification_profiles gp
  LOOP
    BEGIN
      v_total := v_total + rollover_leagues(v_tenant.tenant_id, _week_start);
    EXCEPTION WHEN OTHERS THEN
      -- One tenant failing must not block the rest
      RAISE WARNING 'rollover_leagues failed for tenant %: %', v_tenant.tenant_id, SQLERRM;
    END;
  END LOOP;
  RETURN v_total;
END;
$$;

-- Rollover is service/cron-only
REVOKE ALL ON FUNCTION public.rollover_leagues(UUID, DATE) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollover_all_leagues(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_leagues(UUID, DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollover_all_leagues(DATE) TO service_role;

-- =============================================================================
-- STEP 5: Student-facing RPCs
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_league_standings()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant UUID := get_tenant_id();
  v_week DATE := date_trunc('week', now())::date;
  v_m league_memberships%ROWTYPE;
  v_tier league_tiers%ROWTYPE;
  v_max_tier INT;
  v_opt BOOLEAN;
  v_standings JSONB;
  v_size INT;
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RETURN jsonb_build_object('in_league', false, 'reason', 'no_league');
  END IF;

  SELECT leagues_opt_out INTO v_opt
  FROM gamification_profiles
  WHERE user_id = v_uid AND tenant_id = v_tenant;

  IF COALESCE(v_opt, false) THEN
    RETURN jsonb_build_object('in_league', false, 'reason', 'opted_out');
  END IF;

  SELECT * INTO v_m
  FROM league_memberships
  WHERE user_id = v_uid AND tenant_id = v_tenant AND week_start = v_week;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('in_league', false, 'reason', 'no_league');
  END IF;

  SELECT * INTO v_tier FROM league_tiers WHERE tier = v_m.tier;
  SELECT MAX(tier) INTO v_max_tier FROM league_tiers;

  SELECT jsonb_agg(
           jsonb_build_object(
             'user_id', s.user_id,
             'full_name', s.full_name,
             'avatar_url', s.avatar_url,
             'weekly_xp', s.wxp,
             'rank', s.rnk,
             'is_me', s.user_id = v_uid
           ) ORDER BY s.rnk
         ),
         COUNT(*)
  INTO v_standings, v_size
  FROM (
    SELECT m.user_id, COALESCE(p.full_name, p.username) AS full_name, p.avatar_url,
           COALESCE(x.wxp, 0) AS wxp,
           ROW_NUMBER() OVER (ORDER BY COALESCE(x.wxp, 0) DESC, m.user_id) AS rnk
    FROM league_memberships m
    JOIN profiles p ON p.id = m.user_id
    LEFT JOIN LATERAL (
      SELECT SUM(t.xp_amount) AS wxp
      FROM gamification_xp_transactions t
      WHERE t.user_id = m.user_id
        AND t.tenant_id = m.tenant_id
        AND t.created_at >= v_week
    ) x ON true
    WHERE m.tenant_id = v_tenant
      AND m.cohort_id = v_m.cohort_id
      AND m.week_start = v_week
  ) s;

  RETURN jsonb_build_object(
    'in_league', true,
    'reason', NULL,
    'week_start', v_week,
    'week_end', v_week + 7,
    'tier', jsonb_build_object(
      'tier', v_tier.tier,
      'slug', v_tier.slug,
      'name', v_tier.name,
      'max_tier', v_max_tier
    ),
    'promote_count', v_tier.promote_count,
    'demote_count', v_tier.demote_count,
    'cohort_size', v_size,
    'standings', COALESCE(v_standings, '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_league_opt_out(_opt_out BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tenant UUID := get_tenant_id();
BEGIN
  IF v_uid IS NULL OR v_tenant IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO gamification_profiles (user_id, tenant_id, leagues_opt_out, updated_at)
  VALUES (v_uid, v_tenant, _opt_out, NOW())
  ON CONFLICT (user_id, tenant_id)
  DO UPDATE SET leagues_opt_out = _opt_out, updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_standings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_league_opt_out(BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.get_league_standings() FROM anon;
REVOKE ALL ON FUNCTION public.set_league_opt_out(BOOLEAN) FROM anon;

-- =============================================================================
-- STEP 6: Weekly pg_cron schedule (primary scheduler; the /api/cron route is a
-- manual trigger / fallback). Mirrors 20260215000003_schedule_leaderboard_refresh.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'league-weekly-rollover',
      '5 0 * * 1',
      'SELECT public.rollover_all_leagues()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not installed; schedule league rollover externally';
  END IF;
END $$;
