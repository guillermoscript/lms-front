-- Acceptance test for issue #549 §1 + §2, run inside a rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;

-- Code Academy Pro is on the enterprise plan, so the leagues feature gate passes.
\set tenant '''00000000-0000-0000-0000-000000000002'''

CREATE TEMP TABLE t AS
SELECT date_trunc('week', '2026-06-01'::date)::date AS w;

-- 12 synthetic students.
CREATE TEMP TABLE u AS
SELECT gs AS n, gen_random_uuid() AS id FROM generate_series(1, 12) gs;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'l549-' || n || '@test.local', '', now(), now(), '{}'::jsonb, '{}'::jsonb
FROM u;

-- handle_new_user() already inserted profiles for these auth.users.
INSERT INTO profiles (id, full_name, username)
SELECT id, 'League Tester ' || n, 'l549_' || n FROM u
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level, leagues_opt_out)
SELECT id, :tenant::uuid, 0, 1, false FROM u
ON CONFLICT (user_id, tenant_id) DO UPDATE SET leagues_opt_out = false;

-- Week W: everyone in one Silver (tier 2) cohort.
INSERT INTO league_memberships (tenant_id, user_id, week_start, tier, cohort_id)
SELECT :tenant::uuid, u.id, t.w, 2, '11111111-1111-1111-1111-111111111111'::uuid
FROM u, t;

-- XP inside week W's own window: students 1..10 descending, 11 and 12 get none.
-- Student 10 is therefore the lowest-ranked ACTIVE member.
INSERT INTO gamification_xp_transactions (user_id, tenant_id, action_type, xp_amount, created_at)
SELECT u.id, :tenant::uuid, 'test_week_w', (11 - u.n) * 100, t.w + 1
FROM u, t WHERE u.n <= 10;

-- Discriminating check on the XP WINDOW fix: a huge award for student 10, but
-- in week W+1, OUTSIDE [W, W+7). If the window still spanned everything up to
-- the target week, student 10 would rank FIRST and be promoted. With the
-- per-week window they must still rank last and be demoted.
INSERT INTO gamification_xp_transactions (user_id, tenant_id, action_type, xp_amount, created_at)
SELECT u.id, :tenant::uuid, 'test_week_w1_noise', 999999, t.w + 8
FROM u, t WHERE u.n = 10;

-- Recent activity so all 12 clear the 14-day eligibility window at W+14.
INSERT INTO gamification_xp_transactions (user_id, tenant_id, action_type, xp_amount, created_at)
SELECT u.id, :tenant::uuid, 'test_recent', 5, t.w + 11
FROM u, t;

-- Week W+7 is SKIPPED entirely — this is the missed cron tick.
-- Run the rollover for W+14.
SELECT rollover_leagues(:tenant::uuid, (SELECT w + 14 FROM t)) AS inserted;

\echo '=== §1: week W finalized (was left final_rank NULL forever) ==='
SELECT u.n AS student, m.final_rank, m.movement
FROM league_memberships m JOIN u ON u.id = m.user_id, t
WHERE m.tenant_id = :tenant::uuid AND m.week_start = t.w
ORDER BY m.final_rank;

\echo '=== §1: tiers at W+14 — must NOT all be Bronze ==='
SELECT m.tier, count(*) AS students
FROM league_memberships m JOIN u ON u.id = m.user_id, t
WHERE m.tenant_id = :tenant::uuid AND m.week_start = t.w + 14
GROUP BY m.tier ORDER BY m.tier;

\echo '=== ASSERTIONS ==='
DO $$
DECLARE
  v_w DATE := (SELECT w FROM t);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_unranked INT;
  v_stayed INT;
  v_promoted INT;
  v_demoted INT;
  v_zero_promoted INT;
  v_bronze INT;
  v_carried INT;
  v_student10 TEXT;
BEGIN
  -- AC: the skipped week is finalized with correct ranks.
  SELECT count(*) INTO v_unranked FROM league_memberships
   WHERE tenant_id = v_tenant AND week_start = v_w AND final_rank IS NULL;
  IF v_unranked <> 0 THEN
    RAISE EXCEPTION 'FAIL §1: % memberships in week W still unfinalized', v_unranked;
  END IF;

  SELECT count(*) FILTER (WHERE movement = 'stayed'),
         count(*) FILTER (WHERE movement = 'promoted'),
         count(*) FILTER (WHERE movement = 'demoted')
    INTO v_stayed, v_promoted, v_demoted
  FROM league_memberships WHERE tenant_id = v_tenant AND week_start = v_w;

  -- AC: a 10-member (active) cohort produces at least one 'stayed'.
  IF v_stayed < 1 THEN
    RAISE EXCEPTION 'FAIL §2: no student stayed — bands still tile the cohort';
  END IF;
  IF v_promoted <> 2 OR v_demoted <> 2 THEN
    RAISE EXCEPTION 'FAIL §2: expected 2 promoted / 2 demoted for active_size=10, got % / %',
      v_promoted, v_demoted;
  END IF;

  -- AC: zero-XP members are not promoted.
  SELECT count(*) INTO v_zero_promoted
  FROM league_memberships m
  WHERE m.tenant_id = v_tenant AND m.week_start = v_w
    AND m.movement = 'promoted'
    AND NOT EXISTS (
      SELECT 1 FROM gamification_xp_transactions x
      WHERE x.user_id = m.user_id AND x.tenant_id = v_tenant
        AND x.created_at >= v_w AND x.created_at < v_w + 7);
  IF v_zero_promoted <> 0 THEN
    RAISE EXCEPTION 'FAIL §2: % zero-XP member(s) promoted', v_zero_promoted;
  END IF;

  -- The window check: student 10's out-of-week 999999 XP must not have moved them.
  SELECT m.movement INTO v_student10
  FROM league_memberships m
  WHERE m.tenant_id = v_tenant AND m.week_start = v_w AND m.final_rank = 10;
  IF v_student10 <> 'demoted' THEN
    RAISE EXCEPTION 'FAIL §1: XP window leaked across weeks — rank-10 student is %', v_student10;
  END IF;

  -- AC: tiers are preserved across the missed tick, not reset to Bronze.
  SELECT count(*) FILTER (WHERE tier = 1), count(*) FILTER (WHERE tier <> 1)
    INTO v_bronze, v_carried
  FROM league_memberships WHERE tenant_id = v_tenant AND week_start = v_w + 14;
  IF v_bronze <> 2 THEN
    RAISE EXCEPTION 'FAIL §1: expected exactly 2 Bronze (the demoted pair), got % — tier wipe', v_bronze;
  END IF;
  IF v_carried <> 10 THEN
    RAISE EXCEPTION 'FAIL §1: expected 10 students to carry a non-Bronze tier, got %', v_carried;
  END IF;

  RAISE NOTICE 'PASS: stayed=% promoted=% demoted=% bronze_at_W+14=% carried=%',
    v_stayed, v_promoted, v_demoted, v_bronze, v_carried;
END $$;

ROLLBACK;
