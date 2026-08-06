-- Platform billing on crypto rails: Binance Pay + Solana one-time (issue #610, epic #600).
--
-- #603 unified school -> platform checkout behind `supportsPlatformBillingCheckout`,
-- which only Stripe and Lemon Squeezy carry. Binance Pay already has a hosted
-- checkout and an RSA-signed webhook (the student loop uses both), so it needs no
-- schema at all -- it rides the same `webhook_events` -> dispatcher pipeline.
--
-- Solana does need schema. It has no webhook and no redirect URL: the school scans
-- a QR, the wallet builds the transfer against `/api/billing/solana/tx`, and
-- `/api/billing/solana/verify` proves the payment on-chain. That flow needs a
-- server-side record of the pending intent, and `platform_payment_requests` is
-- already exactly that -- an out-of-band settlement with its own amount snapshot,
-- its own TTL and, since #603, its own `payment_provider`. The difference is only
-- WHO confirms it: a super admin for a bank wire, the chain for Solana.
--
-- Pre-launch project (#540 standing note): additive nullable columns, no backfill.

-- ============================================================================
-- 1. platform_payment_requests -- on-chain correlation + settlement lock
-- ============================================================================

ALTER TABLE platform_payment_requests
  -- The random reference pubkey the payment must carry on-chain. Also the lookup
  -- key `/api/billing/solana/tx` is hit with: that endpoint is called by the
  -- wallet app with no session, so a guessable key (request_id) would let anyone
  -- enumerate other schools' pending amounts. Mirrors the student side, where the
  -- same reference lives in transactions.provider_subscription_id.
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,
  -- The confirmed on-chain signature (Solana) or order id (any future rail). The
  -- UNIQUE index below is the replay guard: without it one settled signature
  -- could be polled against two pending requests and buy two plan periods.
  ADD COLUMN IF NOT EXISTS provider_charge_id TEXT,
  -- What the school actually owes ON CHAIN, locked at checkout. USDC is a 1:1 USD
  -- stablecoin so the lock is arithmetic, but a native-SOL amount is converted at
  -- the checkout-time rate and MUST NOT be re-quoted at verify time -- the rate
  -- has moved by then and the school's real transfer would read as a mismatch.
  ADD COLUMN IF NOT EXISTS settlement_currency TEXT,
  ADD COLUMN IF NOT EXISTS settlement_base BIGINT,
  ADD COLUMN IF NOT EXISTS settlement_mint TEXT,
  ADD COLUMN IF NOT EXISTS settlement_sol_usd NUMERIC(20,8);

COMMENT ON COLUMN platform_payment_requests.provider_reference IS
  'Unguessable on-chain correlation key (base58 pubkey for Solana). The wallet-facing /api/billing/solana/tx endpoint loads the pending request by THIS, never by request_id, because it is called without a session.';

COMMENT ON COLUMN platform_payment_requests.provider_charge_id IS
  'Provider-side id of the settled payment (Solana signature). UNIQUE: one on-chain payment can confirm at most one request.';

COMMENT ON COLUMN platform_payment_requests.settlement_base IS
  'Integer base units (lamports / USDC micro) the on-chain transfer is verified against, locked at checkout. NULL for rails that settle in fiat.';

-- Partial unique indexes: only rows that actually carry these keys participate,
-- so every manual bank wire (both columns NULL) stays unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payment_requests_provider_reference
  ON platform_payment_requests(provider_reference)
  WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_payment_requests_provider_charge
  ON platform_payment_requests(provider_charge_id)
  WHERE provider_charge_id IS NOT NULL;

-- ============================================================================
-- 2. platform_plan_prices -- a provider id only exists where a catalog does
-- ============================================================================
-- `provider_price_id` shipped NOT NULL because #601 was written against Stripe and
-- Lemon Squeezy, which both have a remote catalog to point at. Binance Pay and
-- Solana have none (`createsCatalog: false`): there is no id for a super admin to
-- paste, and the amount comes from this table's own `amount` column. Forcing a
-- value made the only honest options a lie or a placeholder, and #602 is the
-- standing lesson about placeholder price ids -- `price_local_*` rows that every
-- checkout then died on.
ALTER TABLE platform_plan_prices
  ALTER COLUMN provider_price_id DROP NOT NULL;

COMMENT ON COLUMN platform_plan_prices.provider_price_id IS
  'Id of the price in the PROVIDER''s catalog. NULL for catalog-less rails (Binance Pay, Solana), where `amount` is what the school is charged. Required in practice for Stripe/Lemon Squeezy: without it their checkout has nothing to bill.';
