-- #929 platform fee sales gate (migration 20261009110000). Run with
-- `supabase test db` against a seeded local stack. Everything rolls back.
--
-- Proves: the gate is inert in 'off' / 'notify_only' even with blocked_at
-- set; it raises LM003 only in 'enforce' + blocked_at; the renewal exemption
-- (design 4.2a) admits exactly native A.1/A.2, self-managed B.1/B.2 and a
-- manual request opened before the block, and refuses forged ids, stale
-- in-flight anchors, lapsed/canceled/never-held plans, other rails, new
-- product sales and free self-enrollment; settling an EXISTING row still
-- works; existing entitlements / has_course_access are untouched (D5).
BEGIN;
SELECT plan(38);

-- Constants (TS twin: lib/billing/sales-gate-constants.ts).
SELECT is(public.fee_gate_self_managed_renewal_window_days(), 30, 'SELF_MANAGED_RENEWAL_WINDOW_DAYS = 30');
SELECT is(public.fee_gate_in_flight_max_age_days(), 3, 'IN_FLIGHT_MAX_AGE_DAYS = 3');

-- ── fixtures (mode notify_only: the gate is inert while we set up) ──
-- u1 ...01, u2 ...02, u3 ...03, u4 ...04 (seeded auth users).
SET LOCAL app.bypass_plan_limits = 'on';
INSERT INTO public.tenants (id, slug, name)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'pgtap-fee-gate', 'pgtap fee gate');
INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
SELECT '92900000-0000-0000-0000-0000000000a1', u, 'student', 'active'
FROM unnest(ARRAY['a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
                  'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004']::uuid[]) u;

INSERT INTO public.plans (plan_id, plan_name, price, duration_in_days, tenant_id, payment_provider) VALUES
  (929001, 'P1 manual',            10, 30, '92900000-0000-0000-0000-0000000000a1', 'manual'),
  (929002, 'P2 stripe',            10, 30, '92900000-0000-0000-0000-0000000000a1', 'stripe'),
  (929003, 'P3 crypto',            10, 30, '92900000-0000-0000-0000-0000000000a1', 'binance_personal'),
  (929004, 'P4 manual lapsed',     10, 30, '92900000-0000-0000-0000-0000000000a1', 'manual'),
  (929005, 'P5 stripe stale',      10, 30, '92900000-0000-0000-0000-0000000000a1', 'stripe'),
  (929006, 'P6 crypto canceled',   10, 30, '92900000-0000-0000-0000-0000000000a1', 'binance_personal'),
  (929007, 'P7 free',               0, 30, '92900000-0000-0000-0000-0000000000a1', 'manual');

INSERT INTO public.courses (course_id, title, status, tenant_id) VALUES
  (929101, 'Paid course', 'published', '92900000-0000-0000-0000-0000000000a1'),
  (929102, 'Free course', 'published', '92900000-0000-0000-0000-0000000000a1');
INSERT INTO public.products (product_id, name, price, tenant_id, payment_provider)
VALUES (929201, 'Product X', 25, '92900000-0000-0000-0000-0000000000a1', 'manual');
INSERT INTO public.product_courses (product_id, course_id, tenant_id)
VALUES (929201, 929101, '92900000-0000-0000-0000-0000000000a1');

-- u1: bought Product X (entitlement), holds P1 manual live, holds the free course.
INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 929201, 25, 'manual', 'successful');
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 929001, 10, 'manual', 'successful');
INSERT INTO public.entitlements (user_id, course_id, tenant_id, source_type, source_id, status)
VALUES ('a1000000-0000-0000-0000-000000000001', 929102, '92900000-0000-0000-0000-0000000000a1', 'free', NULL, 'active');

-- u2: P4 manual paid 100 days ago (past the window), expired; P6 crypto paid
-- 40 days ago but explicitly canceled; P3 crypto paid 40 days ago, expired
-- (inside the window). Each sub is ended before the next is created (#459).
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status, transaction_date)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929004, 10, 'manual', 'successful', now() - interval '100 days');
UPDATE public.subscriptions SET subscription_status = 'expired' WHERE user_id = 'a1000000-0000-0000-0000-000000000002' AND plan_id = 929004;
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status, transaction_date)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929006, 10, 'binance_personal', 'successful', now() - interval '40 days');
UPDATE public.subscriptions SET subscription_status = 'canceled' WHERE user_id = 'a1000000-0000-0000-0000-000000000002' AND plan_id = 929006;
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status, transaction_date)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929003, 10, 'binance_personal', 'successful', now() - interval '40 days');
UPDATE public.subscriptions SET subscription_status = 'expired' WHERE user_id = 'a1000000-0000-0000-0000-000000000002' AND plan_id = 929003;
-- u2: a Product X checkout started before the block, still pending.
INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929201, 25, 'manual', 'pending');

-- u3: Stripe first invoices in flight: P2 pending 1 day (young), P5 pending 5 days (stale).
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status, transaction_date) VALUES
  ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929002, 10, 'stripe', 'sub_inflight', 'pending', now() - interval '1 day'),
  ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929005, 10, 'stripe', 'sub_stale',    'pending', now() - interval '5 days');

-- u4: live native Stripe subscription on P2.
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929002, 10, 'stripe', 'sub_live', 'successful');

-- Manual payment requests for Product X: u3's opened BEFORE the block, the
-- other one (u4) AFTER it. Both already marked payment_received by the admin.
-- Since 20261009120000 "before the block" is the server snapshot taken when
-- blocked_at is set (fee_block_open_requests), so u4's row is inserted after it.
INSERT INTO public.payment_requests (tenant_id, user_id, product_id, contact_name, contact_email, status, created_at) VALUES
  ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929201, 'u3', 'u3@example.com', 'payment_received', now() - interval '2 days');

INSERT INTO public.tenant_fee_standing (tenant_id, state, overdue_since, blocked_at)
VALUES ('92900000-0000-0000-0000-0000000000a1', 'blocked', now() - interval '10 days', now() - interval '1 hour');

INSERT INTO public.payment_requests (tenant_id, user_id, product_id, contact_name, contact_email, status, created_at) VALUES
  ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 'u4', 'u4@example.com', 'payment_received', now());

SELECT ok(
  (SELECT subscription_status = 'active' AND provider_subscription_id = 'sub_live' AND payment_provider = 'stripe'
   FROM public.subscriptions WHERE user_id = 'a1000000-0000-0000-0000-000000000004' AND plan_id = 929002),
  'fixture: u4 holds a live native Stripe subscription'
);

-- A brand-new Product X sale (u4, Stripe). Probe rows use status 'canceled':
-- the gate does not look at status, and canceled rows have no side effects.
-- ── inert outside 'enforce' ──
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'stripe', 'canceled') $$,
  'notify_only + blocked_at: a new sale is NOT refused'
);
UPDATE public.platform_fee_config SET enforcement_mode = 'off';
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'stripe', 'canceled') $$,
  'off + blocked_at: a new sale is NOT refused'
);

-- ── enforce ──
UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'stripe', 'canceled') $$,
  'LM003', 'sales_blocked:fees', 'enforce + blocked_at: a new product sale raises LM003'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', NULL, 929201, 25, 'manual', 'canceled') $$,
  'LM003', NULL, 'a buyer-less row is refused too'
);
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('00000000-0000-0000-0000-000000000002', NULL, NULL, 25, 'stripe', 'canceled') $$,
  'enforce: a tenant without blocked_at keeps selling'
);

-- A. native
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929002, 10, 'stripe', 'sub_live', 'canceled') $$,
  'A.1 native renewal of a live subscription lands'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929002, 10, 'stripe', 'sub_forged', 'canceled') $$,
  'LM003', NULL, 'A: a forged / non-matching provider_subscription_id is refused'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929005, 10, 'stripe', 'sub_live', 'canceled') $$,
  'LM003', NULL, 'A: the held subscription id on a different plan is refused'
);
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929002, 10, 'stripe', 'sub_inflight', 'canceled') $$,
  'A.2 first invoice of a pre-block checkout (pending < 3 days) lands'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, provider_subscription_id, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929005, 10, 'stripe', 'sub_stale', 'canceled') $$,
  'LM003', NULL, 'A.2 a pending anchor older than IN_FLIGHT_MAX_AGE_DAYS is refused'
);

-- B. self-managed
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 929001, 10, 'manual', 'canceled') $$,
  'B.1 manual renewal of a live subscription lands'
);
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929003, 10, 'binance_personal', 'canceled') $$,
  'B.2 crypto renewal after the row expired, inside the 30-day window, lands'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929004, 10, 'manual', 'canceled') $$,
  'LM003', NULL, 'B: a lapsed plan past the renewal window is refused'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000002', 929006, 10, 'binance_personal', 'canceled') $$,
  'LM003', NULL, 'B: an explicitly canceled subscription is refused even inside the window'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 929003, 10, 'binance_personal', 'canceled') $$,
  'LM003', NULL, 'a plan the student never held is refused'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000001', 929001, 10, 'binance_personal', 'canceled') $$,
  'LM003', NULL, 'the held plan on a different rail is refused'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929001, 10, 'manual', 'canceled') $$,
  'LM003', NULL, 'a student with no subscription to that plan is refused'
);

-- Manual request settlement (4.2): money seen before the block.
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000003', 929201, 25, 'manual', 'canceled') $$,
  'confirming a manual request opened before the block lands'
);
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'manual', 'canceled') $$,
  'LM003', NULL, 'a manual request opened after the block is refused'
);

-- Same predicate for the app pre-check.
SELECT is(public.transaction_sales_gate_allows('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, NULL, 'stripe', NULL),
  false, 'transaction_sales_gate_allows: new sale refused');
SELECT is(public.transaction_sales_gate_allows('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', NULL, 929002, 'stripe', 'sub_live'),
  true, 'transaction_sales_gate_allows: held renewal allowed');

-- Operator bypass.
SET LOCAL app.bypass_fee_block = 'on';
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'stripe', 'canceled') $$,
  'app.bypass_fee_block = on skips the gate (operators / seed only)'
);
SET LOCAL app.bypass_fee_block = 'off';

-- ── D5: existing rows and access are untouched ──
SELECT lives_ok(
  $$ UPDATE public.transactions SET status = 'successful'
     WHERE tenant_id = '92900000-0000-0000-0000-0000000000a1' AND user_id = 'a1000000-0000-0000-0000-000000000002'
       AND product_id = 929201 AND status = 'pending' $$,
  'settling a pre-block pending row (UPDATE) still works while blocked'
);
SELECT ok(public.has_course_access('a1000000-0000-0000-0000-000000000002', 929101), 'the settled buyer gets access');
SELECT ok(public.has_course_access('a1000000-0000-0000-0000-000000000001', 929101), 'an existing buyer keeps access while blocked');
SELECT ok(public.has_course_access('a1000000-0000-0000-0000-000000000001', 929102), 'an existing free enrollment keeps access while blocked');
SELECT is(
  (SELECT count(*)::int FROM public.entitlements WHERE tenant_id = '92900000-0000-0000-0000-0000000000a1' AND status <> 'active'
     AND user_id = 'a1000000-0000-0000-0000-000000000001'),
  0, 'no entitlement of an existing holder was revoked'
);
SELECT unalike(
  (SELECT pg_get_functiondef('public.has_course_access'::regproc)), '%fee%',
  'has_course_access does not read fee standing'
);

-- ── free self-enrollment (4.1) ──
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.grant_free_entitlement('a1000000-0000-0000-0000-000000000004', 929102) $$,
  'LM003', 'sales_blocked:fees', 'a NEW free self-enrollment is refused while blocked'
);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT public.grant_free_entitlement('a1000000-0000-0000-0000-000000000001', 929102) $$,
  're-enrolling a free course already held is allowed (idempotent)'
);
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.grant_free_subscription('a1000000-0000-0000-0000-000000000003', 929007) $$,
  'LM003', NULL, 'a NEW free plan activation is refused while blocked'
);
SELECT throws_ok(
  $$ SELECT public.transaction_sales_gate_allows('92900000-0000-0000-0000-0000000000a1', NULL, NULL, NULL, 'manual', NULL) $$,
  '42501', NULL, 'gate predicate is service-role only'
);
RESET ROLE;

-- notify_only again: free enrollment open.
UPDATE public.platform_fee_config SET enforcement_mode = 'notify_only';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT lives_ok(
  $$ SELECT public.grant_free_entitlement('a1000000-0000-0000-0000-000000000004', 929102) $$,
  'notify_only: free self-enrollment works with blocked_at set'
);
RESET ROLE;
SELECT ok(public.has_course_access('a1000000-0000-0000-0000-000000000004', 929102), 'and grants access');

-- Rollback lever: blocked_at cleared => gate open again in enforce.
UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
UPDATE public.tenant_fee_standing SET state = 'ok', blocked_at = NULL, overdue_since = NULL
WHERE tenant_id = '92900000-0000-0000-0000-0000000000a1';
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000a1', 'a1000000-0000-0000-0000-000000000004', 929201, 25, 'stripe', 'canceled') $$,
  'enforce without blocked_at: sales reopen'
);

SELECT * FROM finish();
ROLLBACK;
