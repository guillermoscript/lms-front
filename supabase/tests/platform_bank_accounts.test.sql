-- #929 platform bank accounts (migration 20261009140000). Run with
-- `supabase test db`. Everything rolls back.
--
-- Proves: the table is server-read only (no anon access, a school admin
-- reads nothing and writes nothing, a super admin reads through RLS but
-- still cannot write directly); writes go through the service-role-only
-- functions, which check the actor is a super admin, normalise input,
-- enforce one active account per currency and audit without the number.
BEGIN;
SELECT plan(24);

-- ── privileges ──
SELECT ok(NOT has_table_privilege('anon', 'public.platform_bank_accounts', 'SELECT'), 'anon cannot select');
SELECT ok(NOT has_table_privilege('authenticated', 'public.platform_bank_accounts', 'INSERT'), 'authenticated cannot insert');
SELECT ok(NOT has_table_privilege('authenticated', 'public.platform_bank_accounts', 'UPDATE'), 'authenticated cannot update');
SELECT ok(NOT has_table_privilege('authenticated', 'public.platform_bank_accounts', 'DELETE'), 'authenticated cannot delete');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.save_platform_bank_account(uuid, uuid, text, text, text, text, text, text, text, text, text, integer, boolean)', 'EXECUTE'),
  'authenticated cannot execute save');
SELECT ok(NOT has_function_privilege('anon', 'public.set_platform_bank_account_active(uuid, uuid, boolean)', 'EXECUTE'),
  'anon cannot execute set_active');
SELECT ok(has_function_privilege('service_role', 'public.set_platform_bank_account_active(uuid, uuid, boolean)', 'EXECUTE'),
  'service_role can execute set_active');

-- ── writes through the functions ──
SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account('a1000000-0000-0000-0000-000000000003', NULL, 'USD', 'Main', 'Bank', 'LMS Inc', '123') $$,
  '42501', NULL, 'a non super admin actor is refused');

SELECT lives_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, ' usd ', ' Main USD ', 'First Bank', 'LMS Inc', ' 000123456789 ', '', NULL, 'bofa us 3n', '  ', 1) $$,
  'a super admin creates an account');
SELECT results_eq(
  $$ SELECT currency, label, account_number, account_type, swift_code, extra_instructions, is_active
       FROM public.platform_bank_accounts WHERE label = 'Main USD' $$,
  $$ VALUES ('USD'::text, 'Main USD'::text, '000123456789'::text, NULL::text, 'BOFAUS3N'::text, NULL::text, true) $$,
  'input is normalised (trim, upper-case, blank -> NULL)');
SELECT results_eq(
  $$ SELECT tenant_id, action, details ? 'bank_account_id', details::text LIKE '%000123456789%'
       FROM public.platform_fee_audit_log WHERE action = 'bank_account_created' $$,
  $$ VALUES (NULL::uuid, 'bank_account_created'::text, true, false) $$,
  'creation is audited, platform-scoped, without the account number');

SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, 'USD', 'Second USD', 'Other Bank', 'LMS Inc', '999') $$,
  '23505', NULL, 'only one active account per currency');
SELECT lives_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, 'USD', 'Spare USD', 'Other Bank', 'LMS Inc', '999', _is_active => false) $$,
  'an inactive second account for the same currency is allowed');

SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, 'US', 'Bad', 'Bank', 'Holder', '1') $$,
  '23514', NULL, 'currency must be ISO 4217 alpha-3');
SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, 'EUR', 'Bad', 'Bank', 'Holder', '   ') $$,
  '23514', NULL, 'account number is required');
SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       NULL, 'EUR', 'Bad', 'Bank', 'Holder', '1', _swift_code => 'NOPE') $$,
  '23514', NULL, 'SWIFT must be 8 or 11 alphanumerics');

-- update audits changed field names only
SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
  (SELECT id FROM public.platform_bank_accounts WHERE label = 'Main USD'),
  'USD', 'Main USD', 'First Bank', 'LMS Inc', '000987654321', NULL, NULL, 'BOFAUS3N', NULL, 1);
SELECT is(
  (SELECT details->'changed' FROM public.platform_fee_audit_log WHERE action = 'bank_account_updated'),
  '["account_number"]'::jsonb, 'an update audits the changed field names');
SELECT throws_ok(
  $$ SELECT public.save_platform_bank_account((SELECT user_id FROM public.super_admins LIMIT 1),
       gen_random_uuid(), 'USD', 'X', 'Bank', 'Holder', '1') $$,
  'P0002', NULL, 'updating an unknown account is not found');

-- deactivate / activate
SELECT is(public.set_platform_bank_account_active((SELECT user_id FROM public.super_admins LIMIT 1),
  (SELECT id FROM public.platform_bank_accounts WHERE label = 'Main USD'), false), true, 'deactivate applies');
SELECT is(public.set_platform_bank_account_active((SELECT user_id FROM public.super_admins LIMIT 1),
  (SELECT id FROM public.platform_bank_accounts WHERE label = 'Main USD'), false), false, 'deactivate is a no-op the second time');
SELECT is((SELECT count(*)::int FROM public.platform_fee_audit_log WHERE action = 'bank_account_deactivated'), 1,
  'one deactivation audit row');

-- ── RLS ──
-- Admin of Code Academy (not a super admin).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002"}', true);
SELECT is((SELECT count(*)::int FROM public.platform_bank_accounts), 0, 'a school admin reads no bank accounts');
SELECT throws_ok(
  $$ INSERT INTO public.platform_bank_accounts (currency, label, bank_name, account_holder, account_number)
     VALUES ('EUR', 'Mine', 'Bank', 'Me', '1') $$,
  '42501', NULL, 'a school admin cannot insert a bank account');
RESET ROLE;

-- A super admin reads through RLS but has no direct write grant.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001","is_super_admin":true}', true);
SELECT is((SELECT count(*)::int FROM public.platform_bank_accounts), 2, 'a super admin reads all accounts');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
