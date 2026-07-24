-- Extend the (previously dead — nothing ever inserted into it) `payouts`
-- table so it can also record MANUAL payouts: for single-account providers
-- (paypal, binance hosted, lemonsqueezy) 100% of every sale lands in the
-- platform's own account with no automatic split, so the school's share has
-- to be wired manually and recorded here.

ALTER TABLE payouts
  ADD COLUMN payout_method VARCHAR(20) NOT NULL DEFAULT 'stripe_connect'
    CHECK (payout_method IN ('stripe_connect', 'manual')),
  ADD COLUMN note TEXT,
  ADD COLUMN recorded_by UUID REFERENCES auth.users(id);

-- Manual payouts are a running balance, not tied to a Stripe Connect payout
-- period — period_start/period_end no longer required.
ALTER TABLE payouts ALTER COLUMN period_start DROP NOT NULL;
ALTER TABLE payouts ALTER COLUMN period_end DROP NOT NULL;

ALTER TABLE payouts DROP CONSTRAINT payouts_period_order;
ALTER TABLE payouts ADD CONSTRAINT payouts_period_order
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start < period_end);

COMMENT ON COLUMN payouts.payout_method IS 'stripe_connect = automated Connect payout webhook; manual = admin-recorded wire/transfer for single-account providers (paypal/binance/lemonsqueezy)';
COMMENT ON COLUMN payouts.note IS 'Optional note left by the admin recording a manual payout';
COMMENT ON COLUMN payouts.recorded_by IS 'Super admin who recorded a manual payout';
