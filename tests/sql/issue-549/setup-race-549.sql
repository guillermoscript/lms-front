-- Committed setup for the real concurrency race test (§6 part b). No BEGIN/ROLLBACK.
\set ON_ERROR_STOP on

\set user_id '''aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0549'''
\set tenant '''00000000-0000-0000-0000-000000000002'''

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (:user_id::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'storerace549b@test.local', '', now(), now(), '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, username)
VALUES (:user_id::uuid, 'Store Race Tester B', 'storerace549b_tester')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Enough XP for 5 purchases of double_xp_1h (price 1000, no max_per_user): 50000 XP -> 5000 coins.
INSERT INTO gamification_profiles (user_id, tenant_id, total_xp, level, total_coins_spent, streak_freezes_available)
VALUES (:user_id::uuid, :tenant::uuid, 50000, 1, 0, 0)
ON CONFLICT (user_id, tenant_id) DO UPDATE
  SET total_xp = EXCLUDED.total_xp, total_coins_spent = 0, streak_freezes_available = 0;

SELECT 'setup complete' AS status, total_xp, total_coins_spent
FROM gamification_profiles WHERE user_id = :user_id::uuid AND tenant_id = :tenant::uuid;
