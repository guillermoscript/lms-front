-- H1 (security review #334): consume the on-chain signature so one confirmed
-- Solana transfer can back EXACTLY ONE successful transaction.
--
-- Before this, /api/payments/solana/verify confirmed a payment purely from the
-- reference key + matching split legs, and never recorded the transaction
-- SIGNATURE. Because findReference matches ANY tx that lists the reference as an
-- account, a single on-chain transfer carrying multiple reference keys could
-- confirm multiple pending transactions ("pay once, enroll N times"). Recording
-- the signature under a partial-unique index makes the second claim fail (23505).

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider_charge_id text;

COMMENT ON COLUMN public.transactions.provider_charge_id IS
  'Provider-side charge identifier consumed on confirmation. For Solana one-time '
  'payments this is the on-chain transaction signature; the partial-unique index '
  'below guarantees a single signature backs only one successful transaction.';

-- One successful transaction per (provider, charge id). A second transaction
-- trying to claim an already-consumed signature violates this and is rejected.
CREATE UNIQUE INDEX IF NOT EXISTS transactions_provider_charge_id_unique
  ON public.transactions (payment_provider, provider_charge_id)
  WHERE provider_charge_id IS NOT NULL AND status = 'successful';
