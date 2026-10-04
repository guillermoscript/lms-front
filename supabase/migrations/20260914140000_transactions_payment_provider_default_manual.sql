-- Manual sales were written with payment_provider = NULL (#746).
--
-- `transactions.payment_provider` is nullable with no default, and
-- `completeAndEnroll` never set it, so every offline sale — the rail every
-- school starts on — was a NULL-provider row. Readers survived only because
-- `resolveProvider()` (lib/payments/revenue-share.ts) and `get_platform_revenue`
-- coalesce "no provider, no Stripe payment intent" to `manual`. Any reader that
-- filters or groups on the column directly silently dropped every offline sale.
--
-- `completeAndEnroll` now writes 'manual' explicitly. This migration makes the
-- column say the same for writers that still omit it (the mock checkout and
-- `grant_free_subscription`, both of which `resolveProvider` already reports as
-- `manual`) and backfills history with exactly `resolveProvider`'s rule, so every
-- revenue and payout figure is unchanged.

BEGIN;

ALTER TABLE public.transactions
  ALTER COLUMN payment_provider SET DEFAULT 'manual';

-- Labelling a row is not a sale event, and two row triggers would treat it as one:
--   * after_transaction_update → trigger_manage_transactions re-runs enroll_user /
--     handle_new_subscription for every successful row — reactivating entitlements
--     revoked since, and creating or extending subscriptions;
--   * before_transaction_split_snapshot_update fires on a payment_provider change
--     and would stamp a legacy NULL snapshot with the tenant's CURRENT split — the
--     #496 bug that trigger exists to prevent.
-- Both are suspended for this one statement, inside this transaction.
ALTER TABLE public.transactions DISABLE TRIGGER USER;

UPDATE public.transactions
SET payment_provider = CASE
  WHEN stripe_payment_intent_id IS NOT NULL THEN 'stripe'
  ELSE 'manual'
END
WHERE payment_provider IS NULL;

ALTER TABLE public.transactions ENABLE TRIGGER USER;

COMMIT;
