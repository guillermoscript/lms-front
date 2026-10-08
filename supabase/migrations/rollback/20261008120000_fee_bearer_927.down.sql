-- Rollback for 20261008120000_fee_bearer_927.sql (issue #927).
--
-- Deploy the app WITHOUT the fee-bearer code first: the checkout routes write
-- transactions.fee_bearer and would fail their insert once the column is gone.
-- Dropping the columns discards which past sales were grossed up; their
-- `amount` stays correct (it is what the buyer was charged).

DROP TRIGGER IF EXISTS before_transaction_fee_bearer_update ON public.transactions;
DROP FUNCTION IF EXISTS public.freeze_transaction_fee_bearer();

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_fee_bearer_check;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS fee_bearer;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_fee_bearer_check;
ALTER TABLE public.products DROP COLUMN IF EXISTS fee_bearer;
