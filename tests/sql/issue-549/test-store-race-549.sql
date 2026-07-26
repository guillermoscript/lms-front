-- Acceptance test for issue #549 §6 part (a): sequential correctness + ceiling.
-- Rolled back — does not touch persistent data.
\set ON_ERROR_STOP on
BEGIN;

\set tenant '''00000000-0000-0000-0000-000000000002'''

CREATE TEMP TABLE u AS SELECT gen_random_uuid() AS id;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
       'storerace549a@test.local', '', now(), now(), '{}'::jsonb, '{}'::jsonb
FROM u;

INSERT INTO profiles (id, full_name, username)
SELECT id, 'Store Race Tester A', 'storerace549a_tester' FROM u
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Enough XP for many purchases: 100000 XP -> 10000 coins (needs 2500 for 5 freezes).
INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level, total_coins_spent, streak_freezes_available)
SELECT id, :tenant::uuid, 100000, 1, 0, 0 FROM u
ON CONFLICT (user_id, tenant_id) DO UPDATE
  SET total_xp = EXCLUDED.total_xp, total_coins_spent = 0, streak_freezes_available = 0;

\set item_freeze '''f7cd45e7-ff89-4122-a45e-d3252950dd75'''

\echo '=== Purchase 1: buy streak_freeze (price 500) ==='
SELECT redeem_store_item((SELECT id FROM u), :tenant::uuid, :item_freeze::uuid) AS result \gset r1_
\echo :r1_result

DO $$
DECLARE
  v_user UUID := (SELECT id FROM u);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_result JSONB;
  v_spent_before INT;
  v_spent_after INT;
  v_freezes_before INT;
  v_freezes_after INT;
BEGIN
  SELECT total_coins_spent, streak_freezes_available INTO v_spent_before, v_freezes_before
  FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;

  IF v_spent_before <> 500 OR v_freezes_before <> 1 THEN
    RAISE EXCEPTION 'FAIL: after purchase 1 expected spent=500 freezes=1, got spent=% freezes=%', v_spent_before, v_freezes_before;
  END IF;
  RAISE NOTICE 'PASS: purchase 1 -> total_coins_spent=%, streak_freezes_available=%', v_spent_before, v_freezes_before;
END $$;

\echo '=== Drive freezes to the ceiling (5), then attempt a 6th ==='
DO $$
DECLARE
  v_user UUID := (SELECT id FROM u);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_item UUID := 'f7cd45e7-ff89-4122-a45e-d3252950dd75';
  v_result JSONB;
  v_spent_before INT;
  v_spent_after INT;
  v_freezes INT;
BEGIN
  -- We're at 1 freeze; buy 4 more to reach 5.
  FOR i IN 1..4 LOOP
    v_result := redeem_store_item(v_user, v_tenant, v_item);
    IF (v_result->>'ok')::boolean IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL: expected purchase % to succeed while below ceiling, got %', i, v_result;
    END IF;
  END LOOP;

  SELECT total_coins_spent, streak_freezes_available INTO v_spent_before, v_freezes
  FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;

  IF v_freezes <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected streak_freezes_available=5 before ceiling attempt, got %', v_freezes;
  END IF;

  -- Attempt the 6th purchase: must be refused, must NOT charge coins.
  v_result := redeem_store_item(v_user, v_tenant, v_item);

  IF (v_result->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: expected ok=false at the freeze ceiling, got %', v_result;
  END IF;
  IF (v_result->>'code') <> 'freeze_ceiling' THEN
    RAISE EXCEPTION 'FAIL: expected code=freeze_ceiling, got %', v_result->>'code';
  END IF;

  SELECT total_coins_spent INTO v_spent_after
  FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;

  IF v_spent_after <> v_spent_before THEN
    RAISE EXCEPTION 'FAIL: ceiling-refused purchase changed total_coins_spent from % to %', v_spent_before, v_spent_after;
  END IF;

  RAISE NOTICE 'PASS: ceiling refusal ok=false code=freeze_ceiling, total_coins_spent unchanged at %', v_spent_after;
END $$;

\echo '=== Insufficient-coins purchase ==='
DO $$
DECLARE
  v_user UUID := (SELECT id FROM u);
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_item UUID := '38067a72-7dfc-4ba3-875a-0d6b51d7f5d4'; -- double_xp_1h, price 1000
  v_result JSONB;
  v_spent_before INT;
  v_spent_after INT;
  v_redemptions_before INT;
  v_redemptions_after INT;
BEGIN
  -- Zero out XP so the user can't afford the 1000-coin item.
  UPDATE gamification_profiles SET total_xp = 0 WHERE user_id = v_user AND tenant_id = v_tenant;

  SELECT total_coins_spent INTO v_spent_before FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;
  SELECT count(*) INTO v_redemptions_before FROM gamification_redemptions WHERE user_id = v_user AND tenant_id = v_tenant;

  v_result := redeem_store_item(v_user, v_tenant, v_item);

  IF (v_result->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: expected ok=false for insufficient coins, got %', v_result;
  END IF;
  IF (v_result->>'code') <> 'insufficient_coins' THEN
    RAISE EXCEPTION 'FAIL: expected code=insufficient_coins, got %', v_result->>'code';
  END IF;

  SELECT total_coins_spent INTO v_spent_after FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;
  SELECT count(*) INTO v_redemptions_after FROM gamification_redemptions WHERE user_id = v_user AND tenant_id = v_tenant;

  IF v_spent_after <> v_spent_before THEN
    RAISE EXCEPTION 'FAIL: insufficient-coins purchase changed total_coins_spent from % to %', v_spent_before, v_spent_after;
  END IF;
  IF v_redemptions_after <> v_redemptions_before THEN
    RAISE EXCEPTION 'FAIL: insufficient-coins purchase inserted a redemption row (% -> %)', v_redemptions_before, v_redemptions_after;
  END IF;

  RAISE NOTICE 'PASS: insufficient_coins refused cleanly, no state change (spent=%, redemptions=%)', v_spent_after, v_redemptions_after;
END $$;

ROLLBACK;
