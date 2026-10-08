-- Issue #927 — who bears the platform fee on a product sale.
--
-- Until now the platform fee was always taken out of the school's share. A
-- school can now choose, per product, to pass it on to the buyer instead:
--
--   school  (default) — the buyer pays the listed price; the platform's cut is
--                       deducted from it. Exactly today's behaviour.
--   student           — the price is grossed up so that, AFTER the platform takes
--                       its usual percentage of what the buyer paid, the school
--                       receives the listed price. $100 at a 20% fee → the buyer
--                       pays $125, the platform keeps 20% of 125 = $25, the school
--                       receives $100.
--
-- Grossing up (rather than price + price × fee%) is deliberate: the platform's
-- cut stays "school_percentage_snapshot of transactions.amount", which is what
-- getPayoutsOwed(), computeRevenueTotals() and Stripe's application_fee_amount
-- already compute. Every existing money sum — and netOfRefunds() for partial
-- refunds — therefore reconciles for both bearers with no change, and a refund
-- of the whole amount returns the surcharge to the buyer too.
--
-- The checkout routes compute the charged amount server-side from products and
-- revenue_splits (lib/payments/fee-bearer.ts); nothing here prices anything.
--
-- SAFETY. Both columns are ADD COLUMN ... NOT NULL DEFAULT '<constant>', which on
-- PostgreSQL 11+ is a metadata-only change (no table rewrite, no long lock), and
-- the default is the historically correct value for every existing row: every
-- product so far has had its fee borne by the school, and so has every sale.

-- 1. The school's choice, per product.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS fee_bearer text NOT NULL DEFAULT 'school';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_fee_bearer_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_fee_bearer_check CHECK (fee_bearer IN ('school', 'student'));

COMMENT ON COLUMN public.products.fee_bearer IS
  'Issue #927: who bears the platform fee on a sale of this product. school (default) = deducted from the school''s share; student = the checkout grosses the price up so the school receives the listed price. Applies only on providers that bear a platform fee (ProviderCapabilities.bearsPlatformFee) and price from our amount; see lib/payments/fee-bearer.ts.';

-- 2. The bearer that actually applied to a sale, snapshotted at checkout.
--
-- Written explicitly by the server (the same insert that derives `amount`),
-- not computed by a trigger from products: the effective bearer depends on the
-- provider gate in lib/payments/fee-bearer.ts, and it must match the amount
-- that insert just charged. A trigger reading products.fee_bearer could
-- disagree with the amount if an admin flipped the setting mid-checkout.
-- `transactions` is server-write-only (#538: no INSERT grant to authenticated,
-- UPDATE granted on three unrelated columns only), so no client can set it.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fee_bearer text NOT NULL DEFAULT 'school';

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_fee_bearer_check;
-- NOT VALID + VALIDATE: the validating scan then holds only SHARE UPDATE
-- EXCLUSIVE, so checkouts and webhooks keep writing while it runs.
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_fee_bearer_check CHECK (fee_bearer IN ('school', 'student')) NOT VALID;
ALTER TABLE public.transactions
  VALIDATE CONSTRAINT transactions_fee_bearer_check;

COMMENT ON COLUMN public.transactions.fee_bearer IS
  'Issue #927: who bore the platform fee on this sale, snapshotted at checkout and frozen afterwards. student = `amount` already includes the gross-up, so the school''s share (amount × school_percentage_snapshot) equals the listed price. Every sum still uses amount - refunded_amount.';

-- 3. Frozen once written, like school_percentage_snapshot (#512): re-labelling a
--    historical sale would misreport what the buyer was charged and why. Restoring
--    OLD (rather than raising) keeps an incidental UPDATE that carries the column
--    — a webhook, a refund — from failing over it.
CREATE OR REPLACE FUNCTION public.freeze_transaction_fee_bearer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.fee_bearer := OLD.fee_bearer;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.freeze_transaction_fee_bearer() IS
  'Issue #927: transactions.fee_bearer is a checkout-time snapshot and never changes afterwards.';

DROP TRIGGER IF EXISTS before_transaction_fee_bearer_update ON public.transactions;
CREATE TRIGGER before_transaction_fee_bearer_update
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  WHEN (NEW.fee_bearer IS DISTINCT FROM OLD.fee_bearer)
  EXECUTE FUNCTION public.freeze_transaction_fee_bearer();
