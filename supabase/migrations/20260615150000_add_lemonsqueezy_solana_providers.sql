-- Provider-agnostic payments (issue #280, Phase 4 + 5): register two new
-- payment providers behind the merged abstraction.
--   Phase 4 — Lemon Squeezy: Merchant of Record, hosted redirect checkout,
--             push-renewal webhooks.
--   Phase 5 — Solana Pay: self-managed-period, QR checkout, on-chain confirm.
--
-- Only the products/plans payment_provider CHECK constraints enumerate allowed
-- providers. transactions.payment_provider / subscriptions.payment_provider are
-- bare TEXT (no CHECK), so the webhook dispatcher already writes provider slugs
-- there freely — no change needed for those.

ALTER TABLE public.products  DROP CONSTRAINT IF EXISTS products_payment_provider_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana'));

ALTER TABLE public.plans     DROP CONSTRAINT IF EXISTS plans_payment_provider_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana'));
