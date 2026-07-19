-- Binance Pay provider (issue #466) — hosted crypto checkout (USDT).
-- Only the products/plans payment_provider CHECK constraints enumerate allowed
-- providers (transactions.payment_provider / subscriptions.payment_provider
-- are free text), so enabling Binance is purely additive here.

ALTER TABLE public.products  DROP CONSTRAINT IF EXISTS products_payment_provider_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs', 'binance'));

ALTER TABLE public.plans     DROP CONSTRAINT IF EXISTS plans_payment_provider_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs', 'binance'));
