-- Verification for §6 part (b). Committed data, no BEGIN/ROLLBACK — read-only.
\set ON_ERROR_STOP on

\set user_id '''aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0549'''
\set tenant '''00000000-0000-0000-0000-000000000002'''

\echo '=== 5 concurrent redeem_store_item results ==='
-- (results were printed individually by each background psql process)

\echo '=== Post-race profile state ==='
SELECT total_xp, total_coins_spent, streak_freezes_available
FROM gamification_profiles WHERE user_id = :user_id::uuid AND tenant_id = :tenant::uuid;

\echo '=== Redemption rows for the double_xp_1h item ==='
SELECT count(*) AS redemption_count, sum(coins_spent) AS sum_coins_spent
FROM gamification_redemptions
WHERE user_id = :user_id::uuid AND tenant_id = :tenant::uuid
  AND item_id = '38067a72-7dfc-4ba3-875a-0d6b51d7f5d4'::uuid;

DO $$
DECLARE
  v_user UUID := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0549';
  v_tenant UUID := '00000000-0000-0000-0000-000000000002';
  v_spent INT;
  v_redemption_count INT;
  v_expected INT := 5 * 1000;
BEGIN
  SELECT total_coins_spent INTO v_spent
  FROM gamification_profiles WHERE user_id = v_user AND tenant_id = v_tenant;

  SELECT count(*) INTO v_redemption_count
  FROM gamification_redemptions
  WHERE user_id = v_user AND tenant_id = v_tenant
    AND item_id = '38067a72-7dfc-4ba3-875a-0d6b51d7f5d4'::uuid;

  IF v_redemption_count <> 5 THEN
    RAISE EXCEPTION 'FAIL: expected 5 gamification_redemptions rows from 5 concurrent purchases, got %', v_redemption_count;
  END IF;

  IF v_spent <> v_expected THEN
    RAISE EXCEPTION 'FAIL (LOST UPDATE): total_coins_spent = % but expected % (5 x 1000). redemption_count=%',
      v_spent, v_expected, v_redemption_count;
  END IF;

  RAISE NOTICE 'PASS: 5 concurrent redemptions -> total_coins_spent=% (expected %), redemption_count=%',
    v_spent, v_expected, v_redemption_count;
END $$;
