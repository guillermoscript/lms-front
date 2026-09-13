-- A refund never applied, and an expired checkout never expired, because the
-- transactions trigger inherited an empty search_path from its caller.
--
-- `public.trigger_manage_transactions()` (AFTER INSERT/UPDATE ON transactions)
-- was created with NO `SET search_path`, so it runs with whatever search_path
-- the *calling* statement has. Every reference in its body was unqualified:
-- `product_courses`, `enroll_user`, `handle_new_subscription`,
-- `cancel_subscription`.
--
-- That was harmless while every writer was a Node client on the `service_role`
-- (search_path = public). It stopped being harmless when the hardened SQL
-- functions arrived, because those pin `SET search_path TO ''` — the Supabase
-- security-lint recommendation — and the trigger inherits it:
--
--   * `apply_webhook_refund` (20260808154215) — `update public.transactions`
--     fires `after_transaction_update`, the trigger's first statement is
--     `SELECT course_id FROM product_courses`, and the whole statement dies with
--     `relation "product_courses" does not exist`. The unified student webhook
--     route turns that into a 500, so EVERY refund on the provider-agnostic rails
--     (lemonsqueezy, paypal, binance) failed: the provider retries forever,
--     `transactions.refunded_amount` is never written, the entitlement is never
--     revoked, and `getPayoutsOwed` keeps counting a sale that was refunded.
--
--   * `settle_expired_checkout` (#624) — same shape, so a product-shaped hosted
--     checkout could not be expired to `canceled` either.
--
-- Note the trigger's FIRST statement runs for ANY row with a non-NULL product_id,
-- regardless of status — so this was not limited to the 'successful' branch. It
-- broke every write to a product transaction from a locked-search_path caller.
--
-- Caught by tests/playwright/lemonsqueezy-webhook-settlement.spec.ts, which is
-- the first test at any level to post a signed webhook over real HTTP to
-- /api/payments/webhook/[provider] against a real database. The unit tests could
-- not see it: they mock @supabase/supabase-js, so no trigger ever fires.
--
-- THE FIX. Pin the function's own search_path and schema-qualify every reference,
-- so it no longer depends on its caller. Behaviour is otherwise byte-identical to
-- the previous body. The status literal is cast explicitly because with
-- `search_path = ''` an unqualified enum label has no schema to resolve against.
--
-- THE CALLEES. A function's `SET search_path` is a GUC for the whole call, so the
-- `''` set here also applies to whatever this body PERFORMs. `public.enroll_user`
-- and `public.handle_new_subscription` are both SECURITY DEFINER with
-- {search_path=public} and so are immune; `public.cancel_subscription` was
-- neither, and is pinned by the companion migration
-- 20260914130000_cancel_subscription_search_path.sql. Do not add an unpinned
-- callee here without pinning it too.

BEGIN;

CREATE OR REPLACE FUNCTION public.trigger_manage_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  _course_id INTEGER;
BEGIN
  -- Product purchase → enroll in linked courses
  IF NEW.product_id IS NOT NULL THEN
    SELECT course_id INTO _course_id
    FROM public.product_courses
    WHERE product_id = NEW.product_id;
    IF FOUND AND NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.enroll_user(NEW.user_id, NEW.product_id);
    END IF;
  END IF;

  -- Plan purchase or renewal
  IF NEW.plan_id IS NOT NULL THEN
    IF NEW.status = 'successful'::public.transaction_status THEN
      PERFORM public.handle_new_subscription(NEW.user_id, NEW.plan_id, NEW.transaction_id);
    ELSIF NEW.status = 'failed'::public.transaction_status THEN
      PERFORM public.cancel_subscription(NEW.user_id, NEW.plan_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
