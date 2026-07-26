-- Acceptance test for issue #549 §5, run inside a rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;

\set tenant '''00000000-0000-0000-0000-000000000002'''

CREATE TEMP TABLE u AS SELECT gen_random_uuid() AS id;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'practicexp549@test.local', '', now(), now(), '{}'::jsonb, '{}'::jsonb
FROM u;

INSERT INTO profiles (id, full_name, username)
SELECT id, 'Practice XP Tester', 'practicexp549_tester' FROM u
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level)
SELECT id, :tenant::uuid, 0, 1 FROM u
ON CONFLICT (user_id, tenant_id) DO UPDATE SET total_xp = EXCLUDED.total_xp;

-- Mixed session: 3 topics, ONE shared session_id.
CREATE TEMP TABLE s AS SELECT gen_random_uuid() AS session_id;

INSERT INTO practice_attempts (user_id, tenant_id, topic, questions, answers, score,
                                total_questions, correct_count, source, mode, session_id)
SELECT u.id, :tenant::uuid, topic, '[]'::jsonb, '[]'::jsonb, 80.0, 5, 4, 'mcp-tutor', 'mixed', s.session_id
FROM u, s, (VALUES ('algebra'), ('geometry'), ('trigonometry')) AS topics(topic);

\echo '=== After 3-row mixed session (one session_id) ==='
SELECT action_type, xp_amount, reference_id, reference_type
FROM gamification_xp_transactions
WHERE user_id = (SELECT id FROM u) AND tenant_id = :tenant::uuid AND action_type = 'practice_attempt';

\echo '=== ASSERTIONS: after mixed session ==='
DO $$
DECLARE
  v_user UUID := (SELECT id FROM u);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_count_after_mixed INT;
  v_amount INT;
  v_attempt_rows INT;
BEGIN
  SELECT count(*) INTO v_attempt_rows FROM practice_attempts WHERE user_id = v_user AND tenant_id = v_tenant;
  IF v_attempt_rows <> 3 THEN
    RAISE EXCEPTION 'setup error: expected 3 practice_attempts rows after mixed-session insert, got %', v_attempt_rows;
  END IF;

  SELECT count(*), max(xp_amount) INTO v_count_after_mixed, v_amount
  FROM gamification_xp_transactions
  WHERE user_id = v_user AND tenant_id = v_tenant AND action_type = 'practice_attempt';

  IF v_count_after_mixed <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 1 XP transaction after a 3-topic mixed session, got %', v_count_after_mixed;
  END IF;
  IF v_amount <> 15 THEN
    RAISE EXCEPTION 'FAIL: expected 15 XP for the mixed session, got %', v_amount;
  END IF;

  RAISE NOTICE 'PASS (mixed): % XP transaction(s) totaling % XP for a 3-topic mixed session', v_count_after_mixed, v_amount;
END $$;

-- Focused session: 1 more row, DIFFERENT session_id.
CREATE TEMP TABLE s2 AS SELECT gen_random_uuid() AS session_id;

INSERT INTO practice_attempts (user_id, tenant_id, topic, questions, answers, score,
                                total_questions, correct_count, source, mode, session_id)
SELECT u.id, :tenant::uuid, 'algebra', '[]'::jsonb, '[]'::jsonb, 90.0, 5, 4, 'mcp-tutor', 'focused', s2.session_id
FROM u, s2;

\echo '=== After the additional focused session (second session_id) ==='
SELECT action_type, xp_amount, reference_id, reference_type
FROM gamification_xp_transactions
WHERE user_id = (SELECT id FROM u) AND tenant_id = :tenant::uuid AND action_type = 'practice_attempt';

\echo '=== ASSERTIONS: after focused session ==='
DO $$
DECLARE
  v_user UUID := (SELECT id FROM u);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_count_after_focused INT;
  v_total_xp INT;
BEGIN
  SELECT count(*) INTO v_count_after_focused
  FROM gamification_xp_transactions
  WHERE user_id = v_user AND tenant_id = v_tenant AND action_type = 'practice_attempt';

  IF v_count_after_focused <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected exactly 2 XP transactions after adding a focused session, got %', v_count_after_focused;
  END IF;

  SELECT sum(xp_amount) INTO v_total_xp
  FROM gamification_xp_transactions
  WHERE user_id = v_user AND tenant_id = v_tenant AND action_type = 'practice_attempt';

  IF v_total_xp <> 30 THEN
    RAISE EXCEPTION 'FAIL: expected 30 total XP (15 per session x 2 sessions), got %', v_total_xp;
  END IF;

  RAISE NOTICE 'PASS (focused added): % transactions / % XP total (a 3-topic mixed session cost the same as a 1-topic focused session)', v_count_after_focused, v_total_xp;
END $$;

ROLLBACK;
