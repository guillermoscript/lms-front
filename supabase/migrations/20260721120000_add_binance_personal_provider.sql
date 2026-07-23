-- binance_personal provider (issue #482) — Binance Pay on a personal (no-KYB)
-- account, confirmed by polling the school's read-only Pay history. Only the
-- products/plans payment_provider CHECK constraints enumerate allowed
-- providers (transactions.payment_provider / subscriptions.payment_provider
-- are free text), so enabling it is purely additive here. Per-tenant Pay ID +
-- encrypted API credentials reuse tenant_payment_wallets (wallet_address +
-- credentials jsonb) — no new table.

ALTER TABLE public.products  DROP CONSTRAINT IF EXISTS products_payment_provider_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs', 'binance', 'binance_personal'));

ALTER TABLE public.plans     DROP CONSTRAINT IF EXISTS plans_payment_provider_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs', 'binance', 'binance_personal'));
