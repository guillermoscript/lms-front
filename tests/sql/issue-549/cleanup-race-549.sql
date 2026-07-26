-- Cleanup for §6 part (b) synthetic user. Committed data, no BEGIN/ROLLBACK.
\set ON_ERROR_STOP on

\set user_id '''aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0549'''
\set tenant '''00000000-0000-0000-0000-000000000002'''

DELETE FROM gamification_redemptions WHERE user_id = :user_id::uuid AND tenant_id = :tenant::uuid;
DELETE FROM gamification_profiles WHERE user_id = :user_id::uuid AND tenant_id = :tenant::uuid;
DELETE FROM profiles WHERE id = :user_id::uuid;
DELETE FROM auth.users WHERE id = :user_id::uuid;

\echo '=== Post-cleanup verification: all should be 0 ==='
SELECT
  (SELECT count(*) FROM gamification_redemptions WHERE user_id = :user_id::uuid) AS redemptions,
  (SELECT count(*) FROM gamification_profiles WHERE user_id = :user_id::uuid) AS gam_profiles,
  (SELECT count(*) FROM profiles WHERE id = :user_id::uuid) AS profiles,
  (SELECT count(*) FROM auth.users WHERE id = :user_id::uuid) AS auth_users;
