-- #929 platform fee ledger foundation (migration 20261009100000). Run with
-- `supabase test db` against a seeded local stack. Everything rolls back.
--
-- Proves: shipped defaults (notify_only, grace 7, min 1.00, {VES}); the sales
-- gate is inert outside 'enforce'; authenticated cannot write any ledger table
-- (server-write-only) and only super admins touch the config; the fx snapshot
-- is frozen; the SQL ledger matches lib/payments/platform-fee-owed.ts (same
-- figures as tests/unit/platform-fee-owed.test.ts); reevaluate only recovers.
BEGIN;
SELECT plan(31);

-- ── defaults ──
SELECT is((SELECT enforcement_mode FROM public.platform_fee_config), 'notify_only', 'kill switch ships as notify_only');
SELECT is((SELECT fee_grace_days FROM public.platform_fee_config), 7, 'FEE_GRACE_DAYS = 7');
SELECT is((SELECT min_blocking_balance FROM public.platform_fee_config), 1.00::numeric, 'min blocking balance 1.00');
SELECT is((SELECT hyperinflation_currencies FROM public.platform_fee_config), '{VES}'::text[], 'hyperinflation currencies {VES}');
SELECT throws_ok(
  $$ INSERT INTO public.platform_fee_config (id) VALUES (false) $$,
  '23514', NULL, 'config is a single row'
);

-- A dedicated tenant so seeded sales do not leak into the ledger figures.
INSERT INTO public.tenants (id, slug, name)
VALUES ('92900000-0000-0000-0000-000000000001', 'pgtap-fee-ledger', 'pgtap fee ledger');
INSERT INTO public.revenue_splits (tenant_id, platform_percentage, school_percentage)
VALUES ('92900000-0000-0000-0000-000000000001', 20, 80)
ON CONFLICT (tenant_id) DO UPDATE SET platform_percentage = 20, school_percentage = 80;

-- ── gate: inert unless enforce ──
INSERT INTO public.tenant_fee_standing (tenant_id, state, overdue_since, blocked_at)
VALUES ('92900000-0000-0000-0000-000000000001', 'blocked', now() - interval '10 days', now());
SELECT is(public.is_tenant_sales_blocked('92900000-0000-0000-0000-000000000001'), false,
  'notify_only: a tenant with blocked_at is NOT sales-blocked');
UPDATE public.platform_fee_config SET enforcement_mode = 'off';
SELECT is(public.is_tenant_sales_blocked('92900000-0000-0000-0000-000000000001'), false, 'off: not blocked');
UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
SELECT is(public.is_tenant_sales_blocked('92900000-0000-0000-0000-000000000001'), true, 'enforce: blocked_at blocks');
SELECT is(public.is_tenant_sales_blocked('00000000-0000-0000-0000-000000000001'), false, 'enforce: a tenant without standing is open');
UPDATE public.platform_fee_config SET enforcement_mode = 'notify_only';
SELECT throws_ok(
  $$ UPDATE public.tenant_fee_standing SET blocked_at = NULL WHERE tenant_id = '92900000-0000-0000-0000-000000000001' $$,
  '23514', NULL, 'state and blocked_at cannot disagree (D8)'
);

-- ── ledger rows (user_id NULL: no enrollment side effects) ──
-- Same figures as tests/unit/platform-fee-owed.test.ts "SQL mirror" case.
INSERT INTO public.transactions (tenant_id, user_id, amount, refunded_amount, currency, payment_provider, status, school_percentage_snapshot, transaction_date)
VALUES
  ('92900000-0000-0000-0000-000000000001', NULL, 100,    0,  'usd', 'manual',           'successful', 80, now() - interval '70 days'), -- 20.00
  ('92900000-0000-0000-0000-000000000001', NULL, 49.99,  0,  'usd', 'manual',           'successful', 80, now() - interval '70 days'), -- 10.00
  ('92900000-0000-0000-0000-000000000001', NULL, 30,     10, 'usd', 'binance_personal', 'successful', 80, now()),                      --  4.00
  ('92900000-0000-0000-0000-000000000001', NULL, 50,     50, 'usd', 'manual',           'refunded',   80, now()),                      --  0
  ('92900000-0000-0000-0000-000000000001', NULL, 999,    0,  'usd', 'stripe',           'successful', 80, now()),                      --  0 (fee taken in flight)
  ('92900000-0000-0000-0000-000000000001', NULL, 200,    0,  'usd', 'paypal',           'successful', 90, now()),                      --  0 (other direction)
  ('92900000-0000-0000-0000-000000000001', NULL, 100,    0,  'usd', 'manual',           'pending',    80, now()),                      --  0
  ('92900000-0000-0000-0000-000000000001', NULL, 0,      0,  'usd', 'manual',           'successful', 80, now()),                      --  0 (free)
  ('92900000-0000-0000-0000-000000000001', NULL, 10,     0,  'eur', 'manual',           'successful', 80, now());                      --  2.00 EUR
SELECT results_eq(
  $$ SELECT currency, accrued, paid, sales FROM public.platform_fee_ledger('92900000-0000-0000-0000-000000000001') $$,
  $$ VALUES ('EUR'::text, 2.00::numeric, 0::numeric, 1), ('USD', 34.00, 0, 3) $$,
  'ledger: manual + binance_personal only, net of refunds, per currency'
);
SELECT results_eq(
  $$ SELECT currency, accrued FROM public.platform_fee_ledger('92900000-0000-0000-0000-000000000001', now() - interval '30 days') $$,
  $$ VALUES ('USD'::text, 30.00::numeric) $$,
  '_accrued_before limits accruals by transaction_date'
);

-- Hyperinflation path, exercised with EUR as the configured currency (the
-- currency_type enum has no VES yet). 10 EUR -> 11 USD at sale; 5 EUR refunded
-- -> usd_net 5.50 at the STORED rate -> fee 1.10 USD. A row without a
-- snapshot keeps its own bucket.
UPDATE public.platform_fee_config SET hyperinflation_currencies = '{EUR}';
INSERT INTO public.transactions (tenant_id, user_id, amount, refunded_amount, currency, payment_provider, status, school_percentage_snapshot,
                                 fx_rate_to_usd, fx_rate_source, fx_rate_date, usd_amount)
VALUES ('92900000-0000-0000-0000-000000000001', NULL, 10, 5, 'eur', 'manual', 'successful', 80, 1.1, 'test', current_date, 11.00);
SELECT results_eq(
  $$ SELECT currency, accrued, sales FROM public.platform_fee_ledger('92900000-0000-0000-0000-000000000001') $$,
  $$ VALUES ('EUR'::text, 2.00::numeric, 1), ('USD', 35.10, 4) $$,
  'converted row lands in USD from its stored snapshot; unsnapshotted row keeps its bucket'
);
UPDATE public.platform_fee_config SET hyperinflation_currencies = '{VES}';

-- fx snapshot: all-or-nothing, frozen once written.
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, amount, currency, payment_provider, status, fx_rate_to_usd)
     VALUES ('92900000-0000-0000-0000-000000000001', 1, 'usd', 'manual', 'pending', 1.0) $$,
  '23514', NULL, 'a partial fx snapshot is refused'
);
SELECT throws_ok(
  $$ UPDATE public.transactions SET usd_amount = 12 WHERE tenant_id = '92900000-0000-0000-0000-000000000001' AND usd_amount IS NOT NULL $$,
  '23514', NULL, 'usd_amount is frozen once written'
);
SELECT lives_ok(
  $$ UPDATE public.transactions SET refunded_amount = 6 WHERE tenant_id = '92900000-0000-0000-0000-000000000001' AND usd_amount IS NOT NULL $$,
  'updates that do not touch the snapshot still work'
);

-- ── reevaluate: only recovers ──
-- 30.00 USD accrued >70 days ago is overdue; a 10.00 payment leaves it overdue.
INSERT INTO public.platform_fee_payments (tenant_id, currency, amount, provider, status, paid_at)
VALUES ('92900000-0000-0000-0000-000000000001', 'USD', 10, 'manual', 'succeeded', now());
SELECT is(public.reevaluate_tenant_fee_standing('92900000-0000-0000-0000-000000000001'), 'blocked', 'still overdue: stays blocked');
INSERT INTO public.platform_fee_payments (tenant_id, currency, amount, provider, status, paid_at)
VALUES ('92900000-0000-0000-0000-000000000001', 'USD', 20, 'manual', 'succeeded', now());
SELECT is(public.reevaluate_tenant_fee_standing('92900000-0000-0000-0000-000000000001'), 'ok', 'overdue part paid: recovers');
SELECT ok(
  (SELECT blocked_at IS NULL AND overdue_since IS NULL AND last_evaluated_at IS NOT NULL
   FROM public.tenant_fee_standing WHERE tenant_id = '92900000-0000-0000-0000-000000000001'),
  'recovery clears blocked_at and overdue_since'
);
SELECT is(public.reevaluate_tenant_fee_standing('00000000-0000-0000-0000-000000000001'), 'ok', 'no standing row: ok, nothing created');
SELECT is((SELECT count(*)::int FROM public.tenant_fee_standing WHERE tenant_id = '00000000-0000-0000-0000-000000000001'), 0,
  'reevaluate never creates a standing row');
SELECT throws_ok(
  $$ INSERT INTO public.platform_fee_payments (tenant_id, currency, amount, provider, status) VALUES ('92900000-0000-0000-0000-000000000001', 'USD', 0, 'manual', 'pending') $$,
  '23514', NULL, 'payments are strictly positive (no reverse rows)'
);

-- ── RLS / grants: server-write-only ──
INSERT INTO public.tenant_fee_standing (tenant_id) VALUES ('00000000-0000-0000-0000-000000000002');
-- Admin of Code Academy (not a super admin).
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000002"}', true);
SELECT throws_ok(
  $$ INSERT INTO public.platform_fee_payments (tenant_id, currency, amount, provider, status) VALUES ('00000000-0000-0000-0000-000000000002', 'USD', 5, 'manual', 'succeeded') $$,
  '42501', NULL, 'a school admin cannot record a fee payment'
);
SELECT throws_ok(
  $$ INSERT INTO public.tenant_fee_standing (tenant_id) VALUES ('00000000-0000-0000-0000-000000000003') $$,
  '42501', NULL, 'a school admin cannot write standing'
);
SELECT throws_ok(
  $$ UPDATE public.tenant_fee_standing SET state = 'ok' $$,
  '42501', NULL, 'a school admin cannot clear standing'
);
SELECT throws_ok(
  $$ SELECT public.is_tenant_sales_blocked('00000000-0000-0000-0000-000000000002') $$,
  '42501', NULL, 'gate function is service-role only'
);
SELECT results_eq(
  $$ SELECT tenant_id FROM public.tenant_fee_standing $$,
  $$ VALUES ('00000000-0000-0000-0000-000000000002'::uuid) $$,
  'a school admin sees only its own standing'
);
SELECT throws_ok(
  $$ UPDATE public.transactions SET usd_amount = 1 WHERE tenant_id = '00000000-0000-0000-0000-000000000002' $$,
  '42501', NULL, 'authenticated has no UPDATE grant on the fx snapshot'
);
UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
SELECT is((SELECT count(*)::int FROM public.platform_fee_config), 0, 'a school admin cannot read the config (and so updated nothing)');
RESET ROLE;
SELECT is((SELECT enforcement_mode FROM public.platform_fee_config), 'notify_only', 'config unchanged by a non super admin');

-- A super admin can flip the kill switch; the row records who.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","tenant_id":"00000000-0000-0000-0000-000000000001","is_super_admin":true}', true);
UPDATE public.platform_fee_config SET enforcement_mode = 'off';
RESET ROLE;
SELECT results_eq(
  $$ SELECT enforcement_mode, updated_by FROM public.platform_fee_config $$,
  $$ VALUES ('off'::text, 'a1000000-0000-0000-0000-000000000002'::uuid) $$,
  'a super admin flips the kill switch and is recorded as updated_by'
);

SELECT * FROM finish();
ROLLBACK;
