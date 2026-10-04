-- Issue #727: `completeAndEnroll()` wrote `transactions.payment_method` as the
-- template literal `manual - ${request.payment_method}` with no guard, so every
-- manual sale confirmed without a typed method stored the literal string
-- "manual - null" — which is what the admin Transactions table then printed.
--
-- The writer now stores `manual` (mapped to the translated "Manual" label) and
-- appends the method only when one was typed. This one-off rewrites the rows
-- the old writer left behind; it touches nothing else on the row.
UPDATE public.transactions
SET payment_method = 'manual'
WHERE payment_method IN ('manual - null', 'manual - undefined', 'manual - ', 'manual -');
