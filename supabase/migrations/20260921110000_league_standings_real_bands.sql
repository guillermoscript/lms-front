-- The league standings say who will actually move, not who a seed row says.
--
-- `get_league_standings()` returned `league_tiers.promote_count/demote_count`
-- raw — 5 and 5 for every tier. `rollover_leagues()` stopped using those raw
-- numbers in #549 §2: it sizes both bands against the cohort's ACTIVE members
-- (weekly XP > 0), never moves a zero-XP member, never promotes out of the top
-- tier or demotes out of the bottom one. So the widget drew five green arrows
-- in a cohort of six, and a red arrow on a student with no XP who was never
-- going anywhere — a promise on Sunday night the Monday rollover did not keep.
--
-- Found while building the native league screen (guillermoscript/lms-app#12),
-- which had to re-derive the SQL on the device to tell the truth. The rule
-- belongs here, once: every standings row now carries its own `zone`, and the
-- top-level counts are the scaled ones. Clients render; they do not compute.
--
-- Ranking also ties on `m.id` now, as the rollover does, instead of `user_id` —
-- two students level on XP were shown in one order and ranked in the other.

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
  v_active INT;
  v_p INT;
  v_d INT;
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

  WITH xp AS (
    SELECT m.id, m.user_id,
           COALESCE(p.full_name, p.username) AS full_name, p.avatar_url,
           COALESCE(x.wxp, 0) AS wxp
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
  ),
  ranked AS (
    SELECT xp.*,
           ROW_NUMBER() OVER (ORDER BY wxp DESC, id) AS rnk,
           COUNT(*) FILTER (WHERE wxp > 0) OVER () AS active_size
    FROM xp
  ),
  -- Same arithmetic as rollover_leagues() (20260726140500). Keep them together.
  banded AS (
    SELECT r.*,
           LEAST(v_tier.promote_count, GREATEST(1, r.active_size / 5), (r.active_size - 1) / 2) AS p_cnt,
           LEAST(v_tier.demote_count,  GREATEST(1, r.active_size / 5), (r.active_size - 1) / 2) AS d_cnt
    FROM ranked r
  ),
  zoned AS (
    SELECT b.*,
           CASE
             WHEN b.wxp <= 0 THEN NULL
             WHEN b.rnk <= b.p_cnt AND v_m.tier < v_max_tier THEN 'promote'
             WHEN b.rnk > GREATEST(b.active_size - b.d_cnt, b.p_cnt) AND v_m.tier > 1 THEN 'demote'
             ELSE NULL
           END AS zone
    FROM banded b
  )
  SELECT jsonb_agg(
           jsonb_build_object(
             'user_id', z.user_id,
             'full_name', z.full_name,
             'avatar_url', z.avatar_url,
             'weekly_xp', z.wxp,
             'rank', z.rnk,
             'is_me', z.user_id = v_uid,
             'zone', z.zone
           ) ORDER BY z.rnk
         ),
         COUNT(*),
         COALESCE(MAX(z.active_size), 0),
         COUNT(*) FILTER (WHERE z.zone = 'promote'),
         COUNT(*) FILTER (WHERE z.zone = 'demote')
  INTO v_standings, v_size, v_active, v_p, v_d
  FROM zoned z;

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
    -- How many members WILL move if the week ended now — not the seed's 5/5.
    'promote_count', v_p,
    'demote_count', v_d,
    'cohort_size', v_size,
    'active_size', v_active,
    'standings', COALESCE(v_standings, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_league_standings() TO authenticated;
REVOKE ALL ON FUNCTION public.get_league_standings() FROM anon;
