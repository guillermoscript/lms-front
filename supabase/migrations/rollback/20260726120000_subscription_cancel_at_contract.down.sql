-- Rollback for 20260726120000_subscription_cancel_at_contract.sql (issue #545).
--
-- NOT APPLIED BY DEFAULT. Running this restores the column contract that CAUSED
-- the bug: `cancel_at` back to NOT NULL DEFAULT now(), which means every row
-- inserted afterwards is born with a cancel date permanently in the past.
--
-- On its own that is inert — `lib/payments/solana-pull-decision.ts` no longer
-- reads `cancel_at` for the cancel decision — but it also breaks every writer
-- shipped alongside the forward migration: both reactivate actions and
-- `change_subscription_plan`'s reactivate branch now write `cancel_at = NULL`
-- and would fail with 23502, taking the A → B → A plan switch down with them.
-- So this only makes sense together with reverting the TypeScript and the two
-- function migrations (20260726120100 / 20260726120200) in the same commit.
--
-- Only run it if the new contract has broken a legitimate write path and the
-- fix has to be re-cut.

BEGIN;

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_cancel_at_requires_schedule;

-- NOT NULL needs every row populated first; the forward migration deliberately
-- NULLed the rows that are not scheduled to cancel.
UPDATE public.subscriptions
   SET cancel_at = COALESCE(cancel_at, current_period_end, end_date, timezone('utc', now()))
 WHERE cancel_at IS NULL;

ALTER TABLE public.subscriptions ALTER COLUMN cancel_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at SET NOT NULL;

ALTER TABLE public.subscriptions ALTER COLUMN cancel_at_period_end DROP NOT NULL;
ALTER TABLE public.subscriptions ALTER COLUMN cancel_at_period_end DROP DEFAULT;

ALTER TABLE public.subscriptions ALTER COLUMN canceled_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE public.subscriptions ALTER COLUMN ended_at SET DEFAULT timezone('utc'::text, now());

COMMENT ON COLUMN public.subscriptions.cancel_at IS NULL;
COMMENT ON COLUMN public.subscriptions.cancel_at_period_end IS NULL;

COMMIT;
