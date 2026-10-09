-- #929 pay-now, settlement and super-admin ledger tools (migration
-- 20261009130000). Run with `supabase test db`. Everything rolls back.
--
-- Proves: a request names exactly one of plan / fee; webhook settle credits
-- only a matching pending row of the right tenant and rail, is idempotent and
-- unblocks synchronously; amount/currency mismatch is flagged, never
-- credited; refunds/chargebacks reverse the row (append-only); the manual
-- confirm is super-admin only, transactional and replay-safe; closing a fee
-- request cancels its payment; offline/waiver need a reason and are audited;
-- the exemption lifts the gate.
BEGIN;
SELECT plan(38);

SET LOCAL app.bypass_plan_limits = 'on';
INSERT INTO public.tenants (id, slug, name)
VALUES ('92900000-0000-0000-0000-0000000000c1', 'pgtap-fee-paynow', 'pgtap fee paynow');
INSERT INTO public.products (product_id, name, price, tenant_id, payment_provider)
VALUES (929601, 'Product P', 100, '92900000-0000-0000-0000-0000000000c1', 'manual');

-- Two fee-bearing manual sales, two months ago (overdue).
INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status, transaction_date, school_percentage_snapshot) VALUES
  ('92900000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-000000000001', 929601, 100, 'manual', 'successful', now() - interval '62 days', 80),
  ('92900000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-000000000002', 929601, 100, 'manual', 'successful', now() - interval '62 days', 80);

SELECT is((SELECT accrued FROM public.platform_fee_ledger('92900000-0000-0000-0000-0000000000c1') WHERE currency = 'USD'),
  40.00::numeric, 'fixture: 40.00 USD accrued');

UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
INSERT INTO public.tenant_fee_standing (tenant_id, state, overdue_since, blocked_at)
VALUES ('92900000-0000-0000-0000-0000000000c1', 'blocked', now() - interval '20 days', now() - interval '5 days');
SELECT ok(public.is_tenant_sales_blocked('92900000-0000-0000-0000-0000000000c1'), 'fixture: tenant is blocked');

-- ── 1. plan XOR fee ──
INSERT INTO public.platform_fee_payments (payment_id, tenant_id, currency, amount, provider, status)
VALUES ('c1000000-0000-0000-0000-00000000000a', '92900000-0000-0000-0000-0000000000c1', 'USD', 15.00, 'manual', 'pending');

SELECT throws_ok(
  $$ INSERT INTO public.platform_payment_requests (tenant_id, plan_id, fee_payment_id, amount, request_type)
     VALUES ('92900000-0000-0000-0000-0000000000c1', (SELECT plan_id FROM public.platform_plans LIMIT 1),
             'c1000000-0000-0000-0000-00000000000a', 15, 'fee') $$,
  '23514', NULL, 'a request cannot name both a plan and a fee payment');
SELECT throws_ok(
  $$ INSERT INTO public.platform_payment_requests (tenant_id, amount, request_type)
     VALUES ('92900000-0000-0000-0000-0000000000c1', 15, 'fee') $$,
  '23514', NULL, 'a fee request needs its fee payment');
SELECT throws_ok(
  $$ INSERT INTO public.platform_payment_requests (tenant_id, amount, request_type)
     VALUES ('92900000-0000-0000-0000-0000000000c1', 15, 'upgrade') $$,
  '23514', NULL, 'a plan request still needs its plan');
SELECT throws_ok(
  $$ INSERT INTO public.platform_payment_requests (tenant_id, fee_payment_id, amount, request_type)
     VALUES ('92900000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-00000000000a', 15, 'upgrade') $$,
  '23514', NULL, 'a fee payment cannot ride on a plan-typed request');
INSERT INTO public.platform_payment_requests (request_id, tenant_id, fee_payment_id, amount, currency, request_type, bank_reference)
VALUES ('c1000000-0000-0000-0000-0000000000aa', '92900000-0000-0000-0000-0000000000c1',
        'c1000000-0000-0000-0000-00000000000a', 15, 'usd', 'fee', 'WIRE-1');
SELECT pass('a fee request with its payment row is accepted');
INSERT INTO public.platform_payment_requests (request_id, tenant_id, plan_id, amount, request_type)
VALUES ('c1000000-0000-0000-0000-0000000000ee', '92900000-0000-0000-0000-0000000000c1',
        (SELECT plan_id FROM public.platform_plans WHERE slug = 'starter'), 9, 'upgrade');

-- ── 2. webhook settle (Stripe) ──
INSERT INTO public.platform_fee_payments (payment_id, tenant_id, currency, amount, provider, provider_reference, status) VALUES
  ('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'USD', 25.00, 'stripe', 'cs_1', 'pending'),
  ('c1000000-0000-0000-0000-00000000000c', '92900000-0000-0000-0000-0000000000c1', 'USD', 10.00, 'stripe', 'cs_2', 'pending');

SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000001', 'stripe', 'pi_1', 25, 'usd'),
  'not_found', 'a signed event naming another tenant credits nothing');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'manual', 'pi_1', 25, 'usd'),
  'not_found', 'an event from another rail credits nothing');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'stripe', 'pi_1', 24.99, 'usd'),
  'mismatch', 'an amount mismatch is flagged');
SELECT ok((SELECT status = 'pending' AND review_reason LIKE 'amount/currency mismatch%' FROM public.platform_fee_payments
           WHERE payment_id = 'c1000000-0000-0000-0000-00000000000b'), 'a mismatch is never credited, only flagged for review');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'stripe', 'pi_1', 25, 'eur'),
  'mismatch', 'a currency mismatch is flagged');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'stripe', 'pi_1', 25, 'usd'),
  'settled', 'a matching event settles the pending row');
SELECT ok((SELECT status = 'succeeded' AND paid_at IS NOT NULL AND provider_charge_id = 'pi_1' AND review_reason IS NULL
           FROM public.platform_fee_payments WHERE payment_id = 'c1000000-0000-0000-0000-00000000000b'), 'the row is succeeded with its charge id');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000b', '92900000-0000-0000-0000-0000000000c1', 'stripe', 'pi_1', 25, 'usd'),
  'duplicate', 'a redelivered event is a no-op');
SELECT is(public.settle_platform_fee_payment('c1000000-0000-0000-0000-00000000000c', '92900000-0000-0000-0000-0000000000c1', 'stripe', 'pi_1', 10, 'usd'),
  'duplicate', 'one charge settles one payment');
SELECT ok(public.is_tenant_sales_blocked('92900000-0000-0000-0000-0000000000c1'), 'a partial payment (25 of 40) keeps the block');

-- ── 3. manual confirm (super admin) ──
SELECT throws_ok(
  $$ SELECT * FROM public.confirm_platform_fee_request('c1000000-0000-0000-0000-0000000000aa', 'a1000000-0000-0000-0000-000000000001') $$,
  '42501', NULL, 'only a super admin can confirm');
SELECT throws_ok(
  $$ SELECT * FROM public.confirm_platform_fee_request(
       'c1000000-0000-0000-0000-0000000000ee',
       (SELECT user_id FROM public.super_admins LIMIT 1)) $$,
  'P0001', 'Not a platform fee payment request', 'a plan request is refused by the fee confirm');
SELECT is(
  (SELECT applied::text || ':' || standing FROM public.confirm_platform_fee_request('c1000000-0000-0000-0000-0000000000aa', (SELECT user_id FROM public.super_admins LIMIT 1))),
  'true:ok', 'confirming the fee request credits 15 and unblocks in the same transaction');
SELECT ok(NOT public.is_tenant_sales_blocked('92900000-0000-0000-0000-0000000000c1'), 'paid in full: the gate opens immediately');
SELECT ok((SELECT status = 'confirmed' AND confirmed_by IS NOT NULL FROM public.platform_payment_requests
           WHERE request_id = 'c1000000-0000-0000-0000-0000000000aa'), 'the request is confirmed');
SELECT ok((SELECT status = 'succeeded' AND recorded_by IS NOT NULL AND provider_reference = 'WIRE-1' FROM public.platform_fee_payments
           WHERE payment_id = 'c1000000-0000-0000-0000-00000000000a'), 'the manual payment row is succeeded and attributed');
SELECT is((SELECT applied FROM public.confirm_platform_fee_request('c1000000-0000-0000-0000-0000000000aa', (SELECT user_id FROM public.super_admins LIMIT 1))),
  false, 'confirming twice is a no-op');
SELECT is((SELECT count(*)::int FROM public.platform_fee_audit_log WHERE tenant_id = '92900000-0000-0000-0000-0000000000c1' AND action = 'request_confirmed'),
  1, 'one audit row for the confirm');

-- ── 4. refund / chargeback reversal ──
SELECT is(public.reverse_platform_fee_payment_by_charge('stripe', 'pi_1', 'refund'), 'reversed', 'a refund reverses the credited row');
SELECT ok((SELECT status = 'reversed' AND reversed_at IS NOT NULL AND amount = 25 FROM public.platform_fee_payments
           WHERE payment_id = 'c1000000-0000-0000-0000-00000000000b'), 'the row is kept (append-only), status reversed');
SELECT is((SELECT paid FROM public.platform_fee_ledger('92900000-0000-0000-0000-0000000000c1') WHERE currency = 'USD'),
  15.00::numeric, 'a reversed payment no longer counts as paid');
SELECT is(public.reverse_platform_fee_payment_by_charge('stripe', 'pi_1', 'chargeback'), 'duplicate', 'a second reversal is a no-op');
SELECT is(public.reverse_platform_fee_payment_by_charge('stripe', 'pi_unknown', 'refund'), 'not_found', 'an unknown charge reverses nothing');

-- ── 5. closing a fee request cancels its payment ──
INSERT INTO public.platform_fee_payments (payment_id, tenant_id, currency, amount, provider, status)
VALUES ('c1000000-0000-0000-0000-00000000000d', '92900000-0000-0000-0000-0000000000c1', 'USD', 5.00, 'manual', 'pending');
INSERT INTO public.platform_payment_requests (request_id, tenant_id, fee_payment_id, amount, currency, request_type)
VALUES ('c1000000-0000-0000-0000-0000000000dd', '92900000-0000-0000-0000-0000000000c1', 'c1000000-0000-0000-0000-00000000000d', 5, 'usd', 'fee');
UPDATE public.platform_payment_requests SET status = 'rejected' WHERE request_id = 'c1000000-0000-0000-0000-0000000000dd';
SELECT is((SELECT status FROM public.platform_fee_payments WHERE payment_id = 'c1000000-0000-0000-0000-00000000000d'),
  'canceled', 'a rejected fee request cancels its pending payment');

-- ── 6. offline / waiver ──
SELECT throws_ok(
  $$ SELECT public.record_platform_fee_payment('92900000-0000-0000-0000-0000000000c1', 'USD', 5, 'waiver', (SELECT user_id FROM public.super_admins LIMIT 1), '') $$,
  '22023', 'A reason is required', 'a waiver needs a reason');
SELECT throws_ok(
  $$ SELECT public.record_platform_fee_payment('92900000-0000-0000-0000-0000000000c1', 'usd', 5, 'offline', (SELECT user_id FROM public.super_admins LIMIT 1), 'bank') $$,
  '22023', NULL, 'currency must be an upper-case ISO code');
SELECT ok(
  public.record_platform_fee_payment('92900000-0000-0000-0000-0000000000c1', 'USD', 5.50, 'waiver', (SELECT user_id FROM public.super_admins LIMIT 1), 'goodwill credit') IS NOT NULL,
  'a waiver is recorded');
SELECT ok((SELECT provider = 'waiver' AND status = 'succeeded' AND notes = 'goodwill credit' FROM public.platform_fee_payments
           WHERE tenant_id = '92900000-0000-0000-0000-0000000000c1' AND provider = 'waiver'),
  'the waiver is an append-only payment row with its reason');
SELECT is((SELECT count(*)::int FROM public.platform_fee_audit_log WHERE tenant_id = '92900000-0000-0000-0000-0000000000c1' AND action IN ('waived', 'payment_reversed')),
  2, 'the waiver and the refund reversal are audited');

-- ── 7. exemption ──
UPDATE public.tenant_fee_standing SET state = 'blocked', blocked_at = now(), overdue_since = now() - interval '20 days'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000c1';
SELECT ok(public.is_tenant_sales_blocked('92900000-0000-0000-0000-0000000000c1'), 'fixture: blocked again');
SELECT public.set_tenant_fee_exemption('92900000-0000-0000-0000-0000000000c1', true, (SELECT user_id FROM public.super_admins LIMIT 1), 'strategic partner');
SELECT ok((SELECT enforcement_exempt AND blocked_at IS NULL AND state = 'overdue' FROM public.tenant_fee_standing
           WHERE tenant_id = '92900000-0000-0000-0000-0000000000c1')
          AND NOT public.is_tenant_sales_blocked('92900000-0000-0000-0000-0000000000c1'),
  'exempting a blocked tenant lifts the block');

SELECT * FROM finish();
ROLLBACK;
