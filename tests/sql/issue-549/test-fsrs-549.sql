-- Acceptance test for issue #549 §4, run inside a rolled-back transaction.
\set ON_ERROR_STOP on
BEGIN;

\set tenant '''00000000-0000-0000-0000-000000000002'''

-- Synthetic user.
CREATE TEMP TABLE u AS SELECT gen_random_uuid() AS id;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'fsrs549@test.local', '', now(), now(), '{}'::jsonb, '{}'::jsonb
FROM u;

INSERT INTO profiles (id, full_name, username)
SELECT id, 'FSRS Tester', 'fsrs549_tester' FROM u
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Card A: LAPSED card (repetitions reset to 0 by old SM-2 "again" branch).
INSERT INTO review_cards (id, user_id, tenant_id, front, back, ease, interval_days,
                           repetitions, last_reviewed_at, stability, difficulty, lapses)
SELECT 900001, u.id, :tenant::uuid, 'Card A front', 'Card A back', 1.7, 0,
       0, now() - interval '3 days', NULL, NULL, 0
FROM u;

-- Card A2: an untouched duplicate of A's pre-migration state, used only to
-- demonstrate the ORIGINAL predicate matches zero rows.
INSERT INTO review_cards (id, user_id, tenant_id, front, back, ease, interval_days,
                           repetitions, last_reviewed_at, stability, difficulty, lapses)
SELECT 900002, u.id, :tenant::uuid, 'Card A2 front', 'Card A2 back', 1.7, 0,
       0, now() - interval '3 days', NULL, NULL, 0
FROM u;

-- Card B: NEVER-REVIEWED card.
INSERT INTO review_cards (id, user_id, tenant_id, front, back, ease, interval_days,
                           repetitions, last_reviewed_at, stability, difficulty, lapses)
SELECT 900003, u.id, :tenant::uuid, 'Card B front', 'Card B back', 2.5, 0,
       0, NULL, NULL, NULL, 0
FROM u;

-- Card C: ALREADY-SEEDED card (first backfill pass already ran on it).
INSERT INTO review_cards (id, user_id, tenant_id, front, back, ease, interval_days,
                           repetitions, last_reviewed_at, stability, difficulty, lapses)
SELECT 900004, u.id, :tenant::uuid, 'Card C front', 'Card C back', 2.9, 10,
       3, now() - interval '1 day', 42.0, 5.0, 0
FROM u;

\echo '=== Demonstrate the bug: ORIGINAL predicate against a fresh copy of card A ==='
SELECT count(*) AS old_predicate_matches
FROM review_cards
WHERE id = 900002 AND repetitions > 0 AND stability IS NULL;

-- Re-run the migration's UPDATE statement verbatim, restricted to our synthetic
-- rows via the id range so we don't touch any pre-existing real data.
UPDATE public.review_cards
SET fsrs_state = CASE WHEN repetitions > 0 THEN 2 ELSE 3 END,
    stability  = GREATEST(interval_days, 0.1),
    difficulty = LEAST(10, GREATEST(1, 10 - (ease - 1.3) * 3.75)),
    lapses     = CASE WHEN repetitions > 0 THEN lapses ELSE GREATEST(lapses, 1) END
WHERE (repetitions > 0 OR last_reviewed_at IS NOT NULL)
  AND stability IS NULL
  AND id IN (900001, 900002, 900003, 900004);

\echo '=== Post-migration state of synthetic cards ==='
SELECT id, repetitions, fsrs_state, stability, difficulty, lapses, ease
FROM review_cards WHERE id IN (900001, 900002, 900003, 900004) ORDER BY id;

\echo '=== ASSERTIONS ==='
DO $$
DECLARE
  v_old_pred_count INT;
  v_a RECORD;
  v_b RECORD;
  v_c RECORD;
  v_expected_difficulty NUMERIC;
BEGIN
  SELECT count(*) INTO v_old_pred_count
  FROM review_cards WHERE id = 900002 AND repetitions > 0 AND stability IS NULL;
  IF v_old_pred_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: original predicate matched % rows on a fresh lapsed card, expected 0', v_old_pred_count;
  END IF;

  SELECT * INTO v_a FROM review_cards WHERE id = 900001;
  IF v_a.stability IS NULL OR v_a.difficulty IS NULL THEN
    RAISE EXCEPTION 'FAIL: card A (lapsed) still has NULL stability/difficulty after backfill';
  END IF;
  IF v_a.fsrs_state <> 3 THEN
    RAISE EXCEPTION 'FAIL: card A fsrs_state = %, expected 3 (Relearning)', v_a.fsrs_state;
  END IF;
  IF v_a.lapses < 1 THEN
    RAISE EXCEPTION 'FAIL: card A lapses = %, expected >= 1', v_a.lapses;
  END IF;

  v_expected_difficulty := LEAST(10, GREATEST(1, 10 - (v_a.ease - 1.3) * 3.75));
  IF abs(v_a.difficulty - v_expected_difficulty) > 0.0001 THEN
    RAISE EXCEPTION 'FAIL: card A difficulty = % but formula from ease=% gives %',
      v_a.difficulty, v_a.ease, v_expected_difficulty;
  END IF;

  SELECT * INTO v_b FROM review_cards WHERE id = 900003;
  IF v_b.stability IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: card B (never-reviewed) got a non-NULL stability = %', v_b.stability;
  END IF;
  IF v_b.fsrs_state <> 0 THEN
    RAISE EXCEPTION 'FAIL: card B fsrs_state = %, expected 0 (New, untouched)', v_b.fsrs_state;
  END IF;

  SELECT * INTO v_c FROM review_cards WHERE id = 900004;
  IF v_c.stability IS DISTINCT FROM 42.0 THEN
    RAISE EXCEPTION 'FAIL: card C (already-seeded) stability changed to %, expected unchanged 42.0', v_c.stability;
  END IF;

  RAISE NOTICE 'PASS: cardA difficulty=% (from ease=%) fsrs_state=% lapses=% | cardB stability=NULL fsrs_state=0 | cardC stability unchanged=42.0 | old predicate matched 0 rows',
    v_a.difficulty, v_a.ease, v_a.fsrs_state, v_a.lapses;
END $$;

ROLLBACK;
