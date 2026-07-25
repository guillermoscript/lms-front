-- Issue #528 — transactions RLS restricts rows but not columns.
--
-- `transactions` grants table-level INSERT/UPDATE to `authenticated`
-- (20260126190500_lms_complete.sql), and the RLS policies in
-- 20260313025318_rls_transactions.sql constrain only WHICH ROWS a user may
-- write, never which columns:
--
--   CREATE POLICY "Users can create own transactions"
--     ON public.transactions FOR INSERT TO authenticated
--     WITH CHECK (auth.uid() = user_id AND tenant_id = get_tenant_id());
--
-- So an authenticated student can POST /rest/v1/transactions with any column
-- values they like, provided user_id is theirs and tenant_id is their current
-- tenant. Two consequences, both reached without touching a payment provider:
--
--   1. FREE ENROLMENT. `trigger_manage_transactions` (AFTER INSERT/UPDATE) calls
--      enroll_user(NEW.user_id, NEW.product_id) whenever product_id is set and
--      status = 'successful', and handle_new_subscription(...) on the plan_id
--      branch. A self-inserted 'successful' row therefore writes `entitlements`
--      — i.e. paid course access — with no money involved.
--   2. FABRICATED PAYOUT LIABILITY. getPayoutsOwed() (app/actions/platform/
--      payouts.ts:52) reads transactions WHERE status IN ('successful','refunded')
--      AND payment_provider IN (paypal, lemonsqueezy, binance). A self-inserted
--      row carrying one of those providers lands in grossOwed, so the platform's
--      own payout dashboard reports it owes a school money for a sale that never
--      happened.
--
-- #512 (20260725110000) closed `school_percentage_snapshot` specifically, by
-- making the database compute and freeze that one column. The rest of the row is
-- still caller-controlled. This migration closes the two impacts above.
--
-- THE SHAPE OF THE FIX.
--
-- Both impacts are gated on the SAME thing: a row reaching 'successful' (or, for
-- the payout half, 'refunded'). Neither is reachable from a 'pending' row. So the
-- invariant worth enforcing is narrow and checkable — an untrusted caller may
-- open a transaction, but may not declare it paid. Only the webhook, verify and
-- reconcile paths, which all run on the service-role client and bypass RLS
-- entirely, may do that.
--
-- Two layers, because they defend against different mechanics:
--
--   (a) INSERT policy pins status = 'pending'. Closes the self-INSERT path.
--
--   (b) UPDATE is restricted to the three columns a legitimate user-scoped caller
--       actually writes, and the policy pins the reachable statuses. Closes the
--       self-ESCALATE path — owning a genuine pending row is otherwise a second
--       route to the same place, since after_transaction_update fires the very
--       same trigger.
--
-- WHY (b) NEEDS A COLUMN GRANT AND NOT JUST A POLICY.
--
-- An RLS WITH CHECK sees only the NEW row; it cannot compare NEW to OLD. So a
-- policy alone cannot make a column immutable. Without the column grant a student
-- can open a legitimate pending transaction for a cheap product, PATCH its
-- product_id to an expensive one, pay the cheap price, and let the provider's
-- webhook flip the row to 'successful' — at which point the trigger enrols them
-- in the expensive course. Column privileges close that mechanically, at the
-- grant layer, without needing OLD.
--
-- Note the ordering requirement: a bare REVOKE ... (column) is a NO-OP while the
-- table-level grant is held, so table-level UPDATE must be revoked FIRST and the
-- allowed columns re-granted after.

BEGIN;

-- ---------------------------------------------------------------------------
-- (a) INSERT — an untrusted caller may only open a PENDING transaction.
-- ---------------------------------------------------------------------------
--
-- Permissive policies OR together, so this has to replace the existing policy
-- rather than sit alongside it: an additional policy would widen the grant, not
-- narrow it.
--
-- Callers unaffected (verified against every application write site):
--   app/api/payments/checkout/route.ts:233          status: 'pending'
--   app/api/stripe/create-payment-intent/route.ts:140  status: 'pending'
--
-- Callers that bypass RLS and are therefore untouched: every createAdminClient()
-- / service-role path (the Stripe webhook, lib/payments/webhook-dispatch.ts, the
-- Solana and Binance reconcilers, the two cron routes, payment-requests.ts,
-- admin/binance-personal.ts), plus grant_free_subscription() — SECURITY DEFINER
-- runs as the table owner and the table is not FORCE ROW LEVEL SECURITY, so the
-- free-plan path still inserts its zero-amount 'successful' row.

DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

CREATE POLICY "Users can create own transactions"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- (b) UPDATE — narrow to the three columns a user-scoped caller actually writes.
-- ---------------------------------------------------------------------------
--
-- The complete set of user-scoped UPDATE sites and the columns they write:
--   app/api/payments/checkout/route.ts:320            provider_subscription_id
--   app/api/payments/checkout/route.ts:337            status -> 'failed'
--   app/api/stripe/create-payment-intent/route.ts:187 provider_subscription_id
--   app/api/stripe/create-payment-intent/route.ts:203 status -> 'failed'
--   app/api/stripe/create-payment-intent/route.ts:241 stripe_payment_intent_id
--
-- Everything else — amount, currency, product_id, plan_id, payment_provider,
-- user_id, tenant_id, the settlement_* columns, provider_charge_id,
-- provider_metadata, payment_method, transaction_date, school_percentage_snapshot
-- — becomes unwritable by `authenticated`. A future user-scoped update of any of
-- them fails loudly with `permission denied for column`, which is the intended
-- trade-off: this is a payments table, and a silent success is the worse outcome.

REVOKE UPDATE ON TABLE public.transactions FROM authenticated;

GRANT UPDATE (status, provider_subscription_id, stripe_payment_intent_id)
  ON TABLE public.transactions TO authenticated;

-- USING pins the rows a user may touch at all to their own still-pending ones;
-- every legitimate user-scoped update above runs against a row created moments
-- earlier in the same request, so it is always still 'pending'. WITH CHECK pins
-- where that row may land: 'pending' (a metadata-only update leaves it alone) or
-- 'failed' (the provider-session rollback). 'successful' and 'refunded' — the two
-- statuses the trigger and the payout query care about — are unreachable.

DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND status = 'pending'
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND tenant_id = (SELECT get_tenant_id())
    AND status IN ('pending', 'failed')
  );

COMMIT;
