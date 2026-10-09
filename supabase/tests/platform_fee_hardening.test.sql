-- #929 gate hardening (migration 20261009120000). Run with `supabase test db`
-- against a seeded local stack. Everything rolls back.
--
-- Proves:
--   * a student-forged payment_requests.created_at no longer opens the
--     pre-block settlement exemption (created_at is server-stamped for client
--     writers AND the predicate reads the block-time snapshot, not created_at);
--   * a tenant admin cannot backdate a request, nor repurpose a pre-block
--     request for another buyer/product;
--   * the snapshot follows block episodes (cleared on unblock, retaken on block);
--   * self_enroll_subscription_course() refuses a NEW course choice while
--     blocked (LM003) and keeps re-enrolling an already-held course working;
--     inert in notify_only.
BEGIN;
SELECT plan(19);

SET LOCAL app.bypass_plan_limits = 'on';
INSERT INTO public.tenants (id, slug, name)
VALUES ('92900000-0000-0000-0000-0000000000b1', 'pgtap-fee-harden', 'pgtap fee hardening');
INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
SELECT '92900000-0000-0000-0000-0000000000b1', u, 'student', 'active'
FROM unnest(ARRAY['a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
                  'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004']::uuid[]) u;

INSERT INTO public.courses (course_id, title, status, tenant_id) VALUES
  (929301, 'Held course', 'published', '92900000-0000-0000-0000-0000000000b1'),
  (929302, 'New course',  'published', '92900000-0000-0000-0000-0000000000b1');
INSERT INTO public.products (product_id, name, price, tenant_id, payment_provider) VALUES
  (929401, 'Product Y', 25, '92900000-0000-0000-0000-0000000000b1', 'manual'),
  (929402, 'Product Z', 50, '92900000-0000-0000-0000-0000000000b1', 'manual');
INSERT INTO public.plans (plan_id, plan_name, price, duration_in_days, tenant_id, payment_provider)
VALUES (929501, 'Plan H', 10, 30, '92900000-0000-0000-0000-0000000000b1', 'manual');
INSERT INTO public.plan_courses (plan_id, course_id) VALUES (929501, 929301);

-- u1 holds Plan H (live subscription; handle_new_subscription grants the
-- plan's courses at that moment). The "new course" is added to the plan
-- afterwards, so u1 has never held it.
INSERT INTO public.transactions (tenant_id, user_id, plan_id, amount, payment_provider, status)
VALUES ('92900000-0000-0000-0000-0000000000b1', 'a1000000-0000-0000-0000-000000000001', 929501, 10, 'manual', 'successful');
INSERT INTO public.plan_courses (plan_id, course_id) VALUES (929501, 929302);

SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"92900000-0000-0000-0000-0000000000b1"}';
SELECT lives_ok($$ SELECT public.self_enroll_subscription_course(929301) $$,
  'fixture: u1 picks the held course before any block');

-- u3 opened a manual request for Product Y BEFORE the block.
INSERT INTO public.payment_requests (tenant_id, user_id, product_id, contact_name, contact_email, status)
VALUES ('92900000-0000-0000-0000-0000000000b1', 'a1000000-0000-0000-0000-000000000003', 929401, 'u3', 'u3@example.com', 'payment_received');

-- ── block (enforce) ──
UPDATE public.platform_fee_config SET enforcement_mode = 'enforce';
INSERT INTO public.tenant_fee_standing (tenant_id, state, overdue_since, blocked_at)
VALUES ('92900000-0000-0000-0000-0000000000b1', 'blocked', now() - interval '10 days', now() - interval '1 hour');

SELECT is((SELECT count(*)::int FROM public.fee_block_open_requests WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1'),
  1, 'block snapshot holds the one request open at block time');

-- u4 (a student) forges an old created_at through RLS AFTER the block.
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated","tenant_id":"92900000-0000-0000-0000-0000000000b1"}';
SET LOCAL ROLE authenticated;
INSERT INTO public.payment_requests (tenant_id, user_id, product_id, contact_name, contact_email, status, created_at)
VALUES ('92900000-0000-0000-0000-0000000000b1', 'a1000000-0000-0000-0000-000000000004', 929401, 'u4', 'u4@example.com', 'pending', now() - interval '30 days');
RESET ROLE;

SELECT ok(
  (SELECT created_at >= now() - interval '1 minute' FROM public.payment_requests
   WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000004'),
  'a client-supplied created_at is replaced by the server time'
);

-- The admin marks it payment_received (as an admin would) — still not pre-block.
UPDATE public.payment_requests SET status = 'payment_received'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000004';

SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000004', 929401, NULL, 'manual'),
  false, 'forged created_at does not make the request pre-block');
SELECT throws_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000b1', 'a1000000-0000-0000-0000-000000000004', 929401, 25, 'manual', 'canceled') $$,
  'LM003', 'sales_blocked:fees', 'settling the forged request is refused with LM003'
);

-- Even a server-side (trusted) backdate does not help: the snapshot decides.
UPDATE public.payment_requests SET created_at = now() - interval '60 days'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000004';
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000004', 929401, NULL, 'manual'),
  false, 'a backdated created_at is never consulted');

-- A tenant admin backdating through RLS keeps the old value.
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated","tenant_id":"92900000-0000-0000-0000-0000000000b1","tenant_role":"admin"}';
SET LOCAL ROLE authenticated;
UPDATE public.payment_requests SET created_at = '2020-01-01'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000003';
RESET ROLE;
SELECT ok(
  (SELECT created_at > '2020-01-02'::timestamptz FROM public.payment_requests
   WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000003'),
  'an admin UPDATE through RLS cannot change created_at'
);

-- The genuine pre-block request still settles.
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000003', 929401, NULL, 'manual'),
  true, 'the request open at block time is pre-block');
SELECT lives_ok(
  $$ INSERT INTO public.transactions (tenant_id, user_id, product_id, amount, payment_provider, status)
     VALUES ('92900000-0000-0000-0000-0000000000b1', 'a1000000-0000-0000-0000-000000000003', 929401, 25, 'manual', 'canceled') $$,
  'settling the genuine pre-block request lands'
);
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000003', 929401, NULL, 'stripe'),
  false, 'only the manual rail settles a manual request');

-- Repurposing the pre-block request (another product, another buyer) does not carry the exemption.
UPDATE public.payment_requests SET product_id = 929402
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000003';
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000003', 929402, NULL, 'manual'),
  false, 'a request repointed at another product is not pre-block');
UPDATE public.payment_requests SET product_id = 929401, user_id = 'a1000000-0000-0000-0000-000000000002'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1' AND user_id = 'a1000000-0000-0000-0000-000000000003';
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000002', 929401, NULL, 'manual'),
  false, 'a request handed to another buyer is not pre-block');

-- ── snapshot follows block episodes ──
UPDATE public.tenant_fee_standing SET state = 'ok', blocked_at = NULL, overdue_since = NULL
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1';
SELECT is((SELECT count(*)::int FROM public.fee_block_open_requests WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1'),
  0, 'unblocking clears the snapshot');
UPDATE public.tenant_fee_standing SET state = 'blocked', blocked_at = now(), overdue_since = now() - interval '9 days'
WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1';
SELECT is((SELECT count(*)::int FROM public.fee_block_open_requests WHERE tenant_id = '92900000-0000-0000-0000-0000000000b1'),
  2, 'a new block episode snapshots the requests open now');
SELECT is(public.is_preblock_request_settlement('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000004', 929401, NULL, 'manual'),
  true, 'a request open before the NEW block settles in that episode');

-- ── subscription self-enrollment (4.1) ──
SET LOCAL request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated","tenant_id":"92900000-0000-0000-0000-0000000000b1"}';
SELECT throws_ok($$ SELECT public.self_enroll_subscription_course(929302) $$,
  'LM003', 'sales_blocked:fees', 'blocked: picking a NEW plan course raises LM003');
SELECT lives_ok($$ SELECT public.self_enroll_subscription_course(929301) $$,
  'blocked: re-enrolling an already-held course still works');
SELECT is(public.subscription_enrollment_allowed('92900000-0000-0000-0000-0000000000b1',
  'a1000000-0000-0000-0000-000000000001', 929302), false, 'subscription_enrollment_allowed mirrors the RPC');

UPDATE public.platform_fee_config SET enforcement_mode = 'notify_only';
SELECT lives_ok($$ SELECT public.self_enroll_subscription_course(929302) $$,
  'notify_only: picking a new course is not refused');

SELECT * FROM finish();
ROLLBACK;
