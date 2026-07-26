-- Issue #546 §2 — a never-paid renewal request pauses the expiry downgrade forever.
--
-- `expire-platform-subscriptions` skips the downgrade for any tenant holding a
-- renewal request in ('pending','instructions_sent','payment_received'), and
-- nothing ever moved a request out of those states except a super admin
-- confirming or rejecting it. Clicking "request renewal" and never paying kept
-- the paid plan, its limits and its reduced transaction fee indefinitely.
--
-- Give every request a TTL so the pause is bounded. The cron sweeps lapsed
-- requests to 'expired' (already in the CHECK list since 20260217040000) and
-- both the duplicate-request guards and the downgrade pause ignore anything
-- past `expires_at`.

ALTER TABLE platform_payment_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Backfill open and historical rows alike so the column can be NOT NULL.
UPDATE platform_payment_requests
   SET expires_at = COALESCE(created_at, NOW()) + INTERVAL '14 days'
 WHERE expires_at IS NULL;

ALTER TABLE platform_payment_requests
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '14 days');

ALTER TABLE platform_payment_requests
  ALTER COLUMN expires_at SET NOT NULL;

COMMENT ON COLUMN platform_payment_requests.expires_at IS
  'TTL for an unpaid request (default: created + 14 days). Past this instant the '
  'request stops blocking new requests and stops pausing the expiry downgrade; '
  'the expire-platform-subscriptions cron flips it to status = ''expired''.';

-- The cron sweep and both duplicate guards filter open rows by expiry.
CREATE INDEX IF NOT EXISTS idx_platform_payment_requests_open_expiry
  ON platform_payment_requests (expires_at)
  WHERE status IN ('pending', 'instructions_sent', 'payment_received');
