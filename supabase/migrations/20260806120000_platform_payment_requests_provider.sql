-- platform_payment_requests: describe ANY out-of-band settlement, not only a bank wire (#603).
--
-- The pending -> instructions_sent -> payment_received -> confirmed ladder (#480) is
-- provider-shaped already in everything but its vocabulary: `bank_reference` is just
-- "whatever reference the payer can quote back", and a school settling in USDT to a
-- Pay ID, or paying a PayPal invoice by hand, moves through exactly the same states as
-- one sending a wire. What was missing was a column saying WHICH rail a request is on,
-- so the super-admin queue could not tell a wire from a crypto transfer and the
-- confirmed subscription always claimed `payment_provider = 'manual'`.
--
-- Same CHECK list as platform_plan_prices / platform_subscriptions / tenant_billing_customers
-- (20260805120000_platform_billing_provider_agnostic.sql) — a 9th provider stays a
-- one-line edit in each.
--
-- Pre-launch project (#540 standing note): the DEFAULT backfills the only rows that
-- exist (seed data), which were all bank transfers, so no data migration is needed.

ALTER TABLE platform_payment_requests
  ADD COLUMN IF NOT EXISTS payment_provider TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE platform_payment_requests
  DROP CONSTRAINT IF EXISTS platform_payment_requests_payment_provider_check;

ALTER TABLE platform_payment_requests
  ADD CONSTRAINT platform_payment_requests_payment_provider_check
    CHECK (payment_provider IN (
      'stripe', 'paypal', 'binance', 'binance_personal',
      'manual', 'lemonsqueezy', 'solana', 'solana_subs'
    ));

COMMENT ON COLUMN platform_payment_requests.payment_provider IS
  'Rail this out-of-band settlement travels on. Copied onto platform_subscriptions.payment_provider when a super admin confirms the payment, so a school that paid in USDT is not recorded as a bank transfer. Defaults to ''manual'' (bank wire), which is what every request was before #603.';

CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_provider
  ON platform_payment_requests(payment_provider, status);
