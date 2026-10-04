-- Manual payments: structured payment references + a TTL on student requests (#802)
--
-- Two gaps, both only felt by a school that runs entirely on offline payments:
--
--   1. Nothing structured to match a transfer against. The student submitted one
--      free-text `message` and the school published one free-text instructions
--      blob, so reconciling a Pago Movil / Zelle / wire transfer against an order
--      was eyeball work — and two students could claim the same transfer with
--      nothing noticing.
--
--   2. A request never closed. `payment_requests` had no expiry, unlike
--      `platform_payment_requests` (#546). A `pending`/`contacted` row lived
--      forever inside the partial unique indexes from #754, which meant an
--      abandoned request permanently blocked that student from requesting the
--      same item again.

-- ─── 1. What the student reports after paying ───────────────────────────────
--
-- Deliberately separate from the admin-owned `payment_*` columns: those say what
-- the school ASKED for (derived server-side from products/plans), these say what
-- the student CLAIMS to have sent. Keeping them apart is what lets the admin see
-- a mismatch instead of having it overwritten.
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_to_account TEXT,
  ADD COLUMN IF NOT EXISTS reported_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS reported_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS payer_name TEXT,
  ADD COLUMN IF NOT EXISTS payer_document TEXT,
  ADD COLUMN IF NOT EXISTS payer_bank TEXT,
  ADD COLUMN IF NOT EXISTS payer_phone TEXT,
  ADD COLUMN IF NOT EXISTS payment_reported_at TIMESTAMPTZ;

COMMENT ON COLUMN payment_requests.payment_reference IS
  'Bank/wallet confirmation number the student reports. Unique per school across live requests.';
COMMENT ON COLUMN payment_requests.reported_amount IS
  'What the student says they sent, in reported_currency — may differ from payment_amount when the school prices in one currency and is paid in another.';
COMMENT ON COLUMN payment_requests.payer_name IS
  'Who the transfer actually came from, when that is not the student (a parent, an employer).';

-- One transfer settles one request. A reference re-used on a second live request
-- in the same school is either a mistake or a double claim, and the admin should
-- find out at submit time rather than after enrolling twice. Cancelled rows are
-- excluded so a genuine re-submit after a typo is not blocked forever.
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_reference_unique
  ON payment_requests (tenant_id, lower(payment_reference))
  WHERE payment_reference IS NOT NULL AND status <> 'cancelled';

-- ─── 2. The TTL ─────────────────────────────────────────────────────────────
--
-- `expires_at` is the single clock. It starts at created + 14 days (mirroring
-- REQUEST_TTL_DAYS in lib/payments/manual-request-ttl.ts) and is overwritten with
-- the admin's own `payment_deadline` when they send instructions — an explicit
-- "pay by Friday" outranks the default.
ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

COMMENT ON COLUMN payment_requests.expired_at IS
  'Set by the cron sweep when a request lapsed unpaid. The status is `cancelled` either way; this is what separates "the student changed their mind" from "nobody ever paid".';

-- Existing rows date from before the column, so the default (now + 14d) would
-- hand years-old abandoned requests a fresh two weeks. Anchor them to their own
-- creation instead: anything genuinely stale lapses on the next sweep.
UPDATE payment_requests
   SET expires_at = COALESCE(created_at, NOW()) + INTERVAL '14 days'
 WHERE expires_at IS NULL OR expires_at > COALESCE(created_at, NOW()) + INTERVAL '14 days';

-- The sweep's own access path: only unpaid promises are ever swept, so the index
-- carries just those.
CREATE INDEX IF NOT EXISTS idx_payment_requests_expires_at
  ON payment_requests (expires_at)
  WHERE status IN ('pending', 'contacted');

-- ─── 3. Where the school's money actually lands ─────────────────────────────
--
-- `manual_payment_instructions` (free text) stays as the human note. This adds
-- the structured accounts beside it so the student can be shown copyable account
-- details and, crucially, can say WHICH one they paid into — the first thing an
-- admin needs in order to know which statement to open.
--
-- Shape: { "accounts": [ { "id", "method", "bank", "identifier", "holder",
--          "document", "note" } ] }. The row is written by the settings form on
-- first save — nothing is seeded here, so a school that never opens the editor
-- carries no row and the student simply sees the free-text note as before.
