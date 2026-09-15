-- Same-plan re-purchase and duplicate manual payment requests (issue #754).
--
-- 1. transactions_unique_plan covered status IN ('pending','successful'), so a
--    student could hold ONE settled row per plan, ever. A plan is bought again
--    every period — after it ends, as a manual renewal, as a crypto/legacy
--    re-payment — and findConflictingSubscription lets exactly that through as
--    a renewal (handle_new_subscription extends the period ON CONFLICT). The
--    transaction insert then died on this index on every rail: PayPal and
--    Stripe at the pending insert, manual at completeAndEnroll AFTER the admin
--    had already confirmed the money.
--
--    Narrowed to 'pending' rather than archiving old rows: archiving rewrites a
--    settled sale's status, and every revenue / payout / analytics reader counts
--    status = 'successful', so the school's history would shrink. The pending
--    predicate still guarantees one open checkout per student per plan, which
--    is the race the index exists to stop. handle_new_subscription reads its
--    transaction by transaction_id only, so nothing relied on the settled row
--    being unique.
--
--    transactions_unique_product is deliberately unchanged: a second settled
--    purchase of a course the student already owns IS a duplicate.
--
-- 2. settle_expired_checkout treated ANY successful sibling as "the replacement
--    purchase already settled". With settled plan periods now allowed to
--    coexist, a previous period's sale would mark a genuine late payment as a
--    duplicate, so for plan rows only a sibling settled AFTER the expired
--    checkout was created counts.
--
-- 3. payment_requests had no uniqueness at all: a double-click or a retry left
--    the admin with duplicate requests, and confirming the second one hit (1).
--    One OPEN request per student per item; createPaymentRequest returns the
--    existing one and relies on this index only to settle a concurrent insert.
--    'payment_received' counts as open — money was observed and completion is
--    still outstanding.

BEGIN;

DROP INDEX IF EXISTS public.transactions_unique_plan;

CREATE UNIQUE INDEX transactions_unique_plan
  ON public.transactions (user_id, plan_id)
  WHERE product_id IS NULL
    AND status = 'pending';

CREATE OR REPLACE FUNCTION public.settle_expired_checkout(
  _transaction_id bigint
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  transaction_row public.transactions%rowtype;
  replacement_id bigint;
BEGIN
  SELECT * INTO transaction_row
  FROM public.transactions
  WHERE transaction_id = _transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'ineligible';
  END IF;

  IF transaction_row.status <> 'canceled' OR transaction_row.expired_at IS NULL THEN
    RETURN 'ineligible';
  END IF;

  -- Product-shaped and plan-shaped purchases are separate namespaces, as in the
  -- partial unique indexes. A plan sibling must be NEWER than this checkout:
  -- an earlier period's settled sale is history, not a replacement (#754).
  SELECT t.transaction_id INTO replacement_id
  FROM public.transactions t
  WHERE t.user_id = transaction_row.user_id
    AND t.transaction_id <> transaction_row.transaction_id
    AND t.status = 'successful'
    AND (
      (transaction_row.product_id IS NOT NULL
        AND t.product_id = transaction_row.product_id
        AND t.plan_id IS NULL)
      OR (transaction_row.plan_id IS NOT NULL
        AND t.plan_id = transaction_row.plan_id
        AND t.product_id IS NULL
        AND t.transaction_date > transaction_row.transaction_date)
    )
  LIMIT 1;

  IF replacement_id IS NOT NULL THEN
    UPDATE public.transactions
    SET duplicate_settlement_at = coalesce(duplicate_settlement_at, clock_timestamp())
    WHERE transaction_id = _transaction_id;
    RETURN 'duplicate';
  END IF;

  UPDATE public.transactions t
  SET status = 'canceled',
      expired_at = coalesce(t.expired_at, clock_timestamp())
  WHERE t.user_id = transaction_row.user_id
    AND t.transaction_id <> transaction_row.transaction_id
    AND t.status = 'pending'
    AND (
      (transaction_row.product_id IS NOT NULL
        AND t.product_id = transaction_row.product_id
        AND t.plan_id IS NULL)
      OR (transaction_row.plan_id IS NOT NULL
        AND t.plan_id = transaction_row.plan_id
        AND t.product_id IS NULL)
    );

  UPDATE public.transactions
  SET status = 'successful',
      revived_at = clock_timestamp()
  WHERE transaction_id = _transaction_id;

  RETURN 'revived';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_expired_checkout(bigint)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_expired_checkout(bigint) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_open_product_unique
  ON public.payment_requests (user_id, product_id)
  WHERE plan_id IS NULL
    AND product_id IS NOT NULL
    AND status IN ('pending', 'contacted', 'payment_received');

CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_open_plan_unique
  ON public.payment_requests (user_id, plan_id)
  WHERE product_id IS NULL
    AND plan_id IS NOT NULL
    AND status IN ('pending', 'contacted', 'payment_received');

COMMIT;
