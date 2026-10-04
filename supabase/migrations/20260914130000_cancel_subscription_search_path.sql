-- The other half of 20260914120000: the trigger's last unpinned callee.
--
-- `20260914120000_trigger_manage_transactions_search_path.sql` pinned
-- `public.trigger_manage_transactions()` to `SET search_path = ''` and qualified
-- every reference in its own body. A function's `SET search_path` is a GUC in
-- force for the WHOLE call, nested callees included — so anything the trigger
-- PERFORMs now runs under an empty search_path unless it pins its own.
--
-- Two of the three callees already did:
--   * `public.enroll_user`             — SECURITY DEFINER, {search_path=public}
--   * `public.handle_new_subscription` — SECURITY DEFINER, {search_path=public}
--
-- `public.cancel_subscription(uuid, integer)` did not: `prosecdef = false`,
-- `proconfig = NULL`, and a body that says `UPDATE subscriptions` unqualified
-- (unchanged since 20260126190500). Before 20260914120000 it inherited `public`
-- from the trigger's service-role/PostgREST caller and worked; after it, it
-- inherits `''` and dies with `relation "subscriptions" does not exist`.
--
-- That aborts the WHOLE statement, so every write that sets a PLAN-shaped
-- transaction (`plan_id IS NOT NULL`) to `'failed'` would 42P01:
--   * app/api/stripe/webhook/route.ts           (payment_intent.payment_failed → 500, Stripe retries forever)
--   * lib/payments/webhook-dispatch.ts          (`payment.failed`, e.g. Binance PAY_CLOSED)
--   * app/api/payments/checkout/route.ts        (the rollback inside the provider-failure catch)
--   * app/api/stripe/create-payment-intent/route.ts
--   * the student-facing RLS path ("Users can update own transactions" permits pending → failed)
--
-- No E2E covers a plan-shaped `failed` transaction, so nothing would have caught
-- it. Same failure class as 20260914120000, in the opposite direction.
--
-- THE FIX. Pin this function's own search_path and schema-qualify its table, so
-- it no longer depends on the caller either way. Body is otherwise identical:
-- still SECURITY INVOKER, still only touches `subscriptions`, still only the
-- `active` → `canceled` transition. The enum labels are cast explicitly because
-- with `search_path = ''` there is no schema for a bare label to resolve against.
--
-- NOTE: cancelling must never IMPROVE a status, so the `= 'active'` predicate is
-- load-bearing and stays exactly as it was.

BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_subscription(_user_id uuid, _plan_id integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    -- Mark the subscription as canceled
    UPDATE public.subscriptions
    SET subscription_status = 'canceled'::public.subscription_status
    WHERE user_id = _user_id
      AND plan_id = _plan_id
      AND subscription_status = 'active'::public.subscription_status;
END;
$function$;

COMMIT;
