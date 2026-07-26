-- =============================================================================
-- League rollover: missed-tick catch-up + cohort-scaled promotion bands
-- Issue #549 §1 and §2 (epic #540). Fixes 20260717120000_create_weekly_leagues.
--
-- §1 — One skipped rollover wiped every student's tier.
--   The original resolved the previous week as `v_week - 7` and finalized
--   exactly that one week. Miss a single Monday 00:05 tick (deploy window, or
--   pg_cron absent and nothing external calling /api/cron/league-rollover) and
--   at the next run `v_week - 7` has zero memberships: every student's `pm`
--   join goes NULL, `COALESCE(..., 1)` resets the whole tenant to Bronze, and
--   the genuinely-previous week keeps final_rank/movement NULL forever.
--
--   Now: the previous week is resolved from the data (the greatest week_start
--   below the target that actually has rows for this tenant), and EVERY
--   unfinalized older week is finalized, oldest first. Critically, each week is
--   ranked over its OWN [w, w+7) XP window — carrying the original's single
--   hardcoded window across a multi-week gap would rank a stale cohort over
--   weeks of unrelated activity and produce confidently wrong ranks.
--
--   This makes the ordinary weekly run its own catch-up path; no operator
--   needs to backfill a _week_start by hand.
--
-- §2 — Promotion/relegation carried no information at the minimum cohort size.
--   All five tiers seed promote_count = demote_count = 5 against a cold-start
--   floor of 10 eligible students, so at exactly 10 the promoted and demoted
--   bands tile the cohort and 'stayed' is unreachable — the tier a student
--   holds then says nothing. Bands now scale with cohort size:
--
--     LEAST(tier's count, GREATEST(1, active_size / 5), (active_size - 1) / 2)
--
--   The first term keeps the seeded ceiling, the second targets ~20%, and the
--   third guarantees at least one 'stayed' for any cohort of 3 or more.
--   At active_size = 10 that is 2 promoted / 2 demoted / 6 stayed.
--
--   Zero-XP members were also ranked alongside active ones and tiebroken by
--   membership UUID, so an inactive student could promote over an active one.
--   They are now excluded from the size the bands are computed against and
--   parked as 'stayed' — they still get a final_rank (leaving it NULL would
--   make them re-finalize forever, since final_rank IS NULL is the filter).
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
  v_pending DATE;
  v_settings JSONB;
  v_enabled BOOLEAN;
  v_min INT;
  v_cohort_max INT;
  v_max_tier INT;
  v_count INT;
  v_inserted INT := 0;
BEGIN
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
  -- Finalize EVERY unfinalized past week, oldest first (§1). Each week is
  -- ranked over its own [w, w + 7) XP window.
  -- ---------------------------------------------------------------------------
  FOR v_pending IN
    SELECT DISTINCT week_start
    FROM league_memberships
    WHERE tenant_id = _tenant_id
      AND week_start < v_week
      AND final_rank IS NULL
    ORDER BY week_start
  LOOP
    WITH xp AS (
      SELECT m.id, m.cohort_id, m.tier,
             COALESCE(SUM(t.xp_amount), 0) AS wxp
      FROM league_memberships m
      LEFT JOIN gamification_xp_transactions t
        ON t.user_id = m.user_id
       AND t.tenant_id = m.tenant_id
       AND t.created_at >= v_pending
       AND t.created_at < v_pending + 7
      WHERE m.tenant_id = _tenant_id
        AND m.week_start = v_pending
        AND m.final_rank IS NULL
      GROUP BY m.id, m.cohort_id, m.tier
    ),
    ranked AS (
      SELECT id, tier, wxp,
             ROW_NUMBER() OVER (PARTITION BY cohort_id ORDER BY wxp DESC, id) AS rnk,
             -- Bands are sized against ACTIVE members only (§2); zero-XP rows
             -- sort last under wxp DESC and are parked below.
             COUNT(*) FILTER (WHERE wxp > 0) OVER (PARTITION BY cohort_id) AS active_size
      FROM xp
    ),
    banded AS (
      SELECT r.id, r.tier, r.wxp, r.rnk, r.active_size,
             LEAST(lt.promote_count, GREATEST(1, r.active_size / 5), (r.active_size - 1) / 2) AS p_cnt,
             LEAST(lt.demote_count,  GREATEST(1, r.active_size / 5), (r.active_size - 1) / 2) AS d_cnt
      FROM ranked r
      JOIN league_tiers lt ON lt.tier = r.tier
    )
    UPDATE league_memberships m
    SET final_rank = b.rnk,
        movement = CASE
          -- Inactive members never move on someone else's activity.
          WHEN b.wxp <= 0 THEN 'stayed'
          WHEN b.rnk <= b.p_cnt AND m.tier < v_max_tier THEN 'promoted'
          WHEN b.rnk > GREATEST(b.active_size - b.d_cnt, b.p_cnt) AND m.tier > 1 THEN 'demoted'
          ELSE 'stayed'
        END
    FROM banded b
    WHERE m.id = b.id;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Tier continuity follows the last week that ACTUALLY ran, not v_week - 7.
  -- NULL (no prior week at all) leaves the LEFT JOIN below unmatched, so a
  -- genuine first run still starts everyone at Bronze.
  -- ---------------------------------------------------------------------------
  SELECT MAX(week_start) INTO v_prev_week
  FROM league_memberships
  WHERE tenant_id = _tenant_id
    AND week_start < v_week;

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

-- Grants are unchanged from 20260717120000, restated because CREATE OR REPLACE
-- keeps them but an explicit statement documents the service/cron-only contract.
REVOKE ALL ON FUNCTION public.rollover_leagues(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rollover_leagues(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.rollover_leagues(UUID, DATE) IS
  'Weekly league rollover for one tenant. Finalizes every unfinalized prior week '
  '(each over its own [w, w+7) XP window) and carries tiers from the last week '
  'that actually ran, so a missed cron tick no longer resets the tenant to Bronze. '
  'Promotion/demotion bands scale with active cohort size and always leave at '
  'least one "stayed"; zero-XP members are parked, never promoted (issue #549).';
