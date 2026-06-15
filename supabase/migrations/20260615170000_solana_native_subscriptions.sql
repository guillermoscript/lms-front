-- Native Solana auto-pull subscriptions (issue #280) — the solana-program/
-- subscriptions on-chain program. A new payment_provider 'solana_subs' whose
-- renewals are driven by an off-chain crank cron (no provider webhook, no
-- on-chain scheduler), so it is excluded from the expiry cron (capability
-- supportsNativeSubscriptions=true).

ALTER TABLE public.products  DROP CONSTRAINT IF EXISTS products_payment_provider_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs'));

ALTER TABLE public.plans     DROP CONSTRAINT IF EXISTS plans_payment_provider_check;
ALTER TABLE public.plans
  ADD CONSTRAINT plans_payment_provider_check
  CHECK (payment_provider IN ('stripe', 'manual', 'paypal', 'lemonsqueezy', 'solana', 'solana_subs'));

-- On-chain coordinates the crank needs to pull a native subscription:
-- { subscriber, merchant, planId, mint }. Generic jsonb so other providers can
-- reuse it. NULL for non-Solana subscriptions.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb;

-- The subscriber wallet (and any other per-checkout provider data) captured at
-- subscribe time. For solana_subs the wallet scans the QR off-device, so the
-- web page polling /verify never learns the subscriber pubkey — we persist it
-- here from /subscribe-tx (where the wallet POSTs its account) and read it back
-- in /verify to confirm + fire the first charge. Generic jsonb, NULL otherwise.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb;
