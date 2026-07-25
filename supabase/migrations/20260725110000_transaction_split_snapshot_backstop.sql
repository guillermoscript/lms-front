-- Issue #512 — database backstop for the revenue-split snapshot.
--
-- #496 fixed retroactive repricing by snapshotting revenue_splits.school_percentage
-- onto each transaction, but that snapshot is written at exactly ONE call site
-- (app/api/payments/checkout/route.ts). Every other transaction-insert path
-- omits it, and nothing fails when they do: computeOwedBalances() silently falls
-- back to the tenant's CURRENT split, which is the #496 bug returning by a side
-- door. The number is just quietly wrong.
--
-- WHY INSERT *OR UPDATE*, not INSERT alone.
--
-- The obvious backstop is BEFORE INSERT, on the reasoning that the unsnapshotted
-- insert sites are harmless because they leave payment_provider NULL (they write
-- payment_method instead) or use Stripe Connect, and getPayoutsOwed() filters on
-- platform-settled payment_provider values. That reasoning holds for the insert
-- and fails for the row's lifetime: payment_provider is also written by UPDATE,
-- after the row exists —
--
--   lib/payments/webhook-dispatch.ts:205  .update({ status, payment_provider })
--   app/api/stripe/webhook/route.ts:406   same shape, Stripe subscriptions
--
-- dispatchBillingEvent is the shared activation path for PayPal, the unified
-- provider webhook (Lemon Squeezy et al), and Stripe. PayPal and Lemon Squeezy
-- are precisely the settlesToPlatformAccount providers the payout computation
-- reads. So a row can be inserted with payment_provider NULL, sail past a
-- BEFORE INSERT trigger with nothing to do, and only then be turned into a
-- platform-settled transaction by a webhook — arriving in the payout math with
-- a NULL snapshot. Covering UPDATE closes that path.
--
-- WHAT IT DELIBERATELY DOES NOT DO.
--
-- 1. It never overwrites an existing snapshot. On UPDATE it acts only while the
--    value is still NULL, so a historical transaction is never re-stamped with a
--    newer split — re-stamping would BE the #496 bug, not a fix for it. The
--    app-layer write therefore stays authoritative; this only fills gaps.
--
-- 2. It does not backfill existing NULLs. Rows predating 20260724140000 are
--    documented (in that migration and in lib/payments/payouts-owed.ts) to fall
--    back to the tenant's current split. Backfilling would stamp TODAY's split
--    onto history and manufacture exactly the retroactive repricing #496
--    removed — and it would look authoritative while doing it, which is worse
--    than a documented fallback.
--
-- A CHECK constraint was the alternative offered in the issue. It cannot read
-- revenue_splits, and a check like `payment_provider IS NULL OR snapshot IS NOT
-- NULL` would hard-fail the webhook UPDATE above for any legacy NULL-snapshot
-- row a provider later activates — converting a quiet mispricing into a failed
-- activation and a lost sale. Filling the value beats rejecting the row.

-- Mirrors DEFAULT_SCHOOL_PERCENTAGE in lib/payments/payouts-owed.ts, the 20%
-- platform default in app/api/stripe/create-payment-intent/route.ts, and the
-- row seeded by 20260216212440_create_revenue_infrastructure.sql. Used only
-- when a tenant has no revenue_splits row at all.
CREATE OR REPLACE FUNCTION public.set_transaction_split_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_school_percentage numeric;
BEGIN
  -- Explicit app-layer value wins, always.
  IF NEW.school_percentage_snapshot IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT school_percentage INTO v_school_percentage
  FROM revenue_splits
  WHERE tenant_id = NEW.tenant_id;

  NEW.school_percentage_snapshot := COALESCE(v_school_percentage, 80);

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_transaction_split_snapshot() IS
  'Backstop for #496 (issue #512): fills transactions.school_percentage_snapshot from revenue_splits when a caller omits it. Never overwrites a non-NULL snapshot, so historical rows are not repriced. Fires on UPDATE too, because payment_provider is set post-insert by the webhook activation path (lib/payments/webhook-dispatch.ts).';

DROP TRIGGER IF EXISTS before_transaction_split_snapshot ON transactions;
CREATE TRIGGER before_transaction_split_snapshot
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW
  WHEN (NEW.school_percentage_snapshot IS NULL)
  EXECUTE FUNCTION public.set_transaction_split_snapshot();
