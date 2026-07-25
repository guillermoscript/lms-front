-- Verification for 20260725110000_transaction_split_snapshot_backstop.sql (#512).
--
-- ⚠ LOCAL DATABASE ONLY. Run it against `supabase db reset`, never against cloud
-- or production. Cases 4 and 7 need a row that genuinely starts with a NULL
-- snapshot, which means `ALTER TABLE transactions DISABLE TRIGGER` — that takes a
-- lock which blocks concurrent INSERT/UPDATE on the live payments table for as
-- long as the script holds it, requires table ownership (it will not run as
-- `service_role`), and leaves the trigger disabled for other sessions if the
-- script dies with the transaction still open. The closing ROLLBACK protects the
-- DATA, not availability.
--
-- The repo's vitest suite runs `environment: 'node'` with no database, so the
-- trigger's behaviour cannot be covered there; tests/unit/transaction-split-
-- snapshot-backstop.test.ts only guards the fallback constant against drift.
-- This file is the actual behavioural coverage. Every SELECT prints PASS or FAIL.
--
--   npm run db:reset
--   docker exec -i supabase_db_lms-front psql -U postgres -d postgres \
--     < supabase/snippets/verify_transaction_split_snapshot_backstop.sql
--
-- transactions.user_id is NOT NULL and references auth.users, so this borrows an
-- existing user rather than creating one. Inserts also fire the pre-existing AFTER
-- triggers (trigger_manage_transactions) — harmless here, since that function
-- branches only on product_id / plan_id and these rows carry neither.

BEGIN;

-- Borrow any existing auth user for the FK.
CREATE TEMP TABLE _snapshot_test_user ON COMMIT DROP AS
SELECT id FROM auth.users LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _snapshot_test_user) THEN
    RAISE EXCEPTION 'No auth.users row available — run this against a database with at least one user';
  END IF;
END $$;

-- Isolated fixtures so nothing here depends on, or disturbs, real data.
INSERT INTO tenants (id, name, slug)
VALUES
  ('00000000-0000-0000-0000-0000000005a1', 'Snapshot Test With Split', 'snapshot-test-with-split'),
  ('00000000-0000-0000-0000-0000000005a2', 'Snapshot Test No Split', 'snapshot-test-no-split');

INSERT INTO revenue_splits (tenant_id, platform_percentage, school_percentage)
VALUES ('00000000-0000-0000-0000-0000000005a1', 30, 70);

-- 1. Insert with no snapshot is filled from revenue_splits.
INSERT INTO transactions (user_id, tenant_id, amount, currency, status, payment_method)
SELECT id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'successful', 'mock' FROM _snapshot_test_user
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 1: insert without snapshot filled from revenue_splits (70)'
    ELSE 'FAIL 1: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 70'
  END AS result;

-- 2. THE TAMPER CASE. A caller-supplied snapshot is IGNORED, not honoured —
--    `transactions` RLS restricts which rows a user may write, not which columns,
--    so this value can come from a student inflating their school's balance.
INSERT INTO transactions (user_id, tenant_id, amount, currency, status, payment_method, school_percentage_snapshot)
SELECT id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'successful', 'mock', 100 FROM _snapshot_test_user
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 2: client-supplied snapshot (100) overridden with the real split (70)'
    ELSE 'FAIL 2: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 70'
  END AS result;

-- 3. A tenant with no revenue_splits row falls back to 80
--    (DEFAULT_SCHOOL_PERCENTAGE in lib/payments/payouts-owed.ts).
INSERT INTO transactions (user_id, tenant_id, amount, currency, status, payment_method)
SELECT id, '00000000-0000-0000-0000-0000000005a2', 100, 'usd', 'successful', 'mock' FROM _snapshot_test_user
RETURNING
  CASE WHEN school_percentage_snapshot = 80
    THEN 'PASS 3: missing revenue_splits row falls back to 80'
    ELSE 'FAIL 3: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 80'
  END AS result;

-- Two rows that genuinely start NULL, reproducing pre-migration history.
-- See the LOCAL-ONLY warning at the top before running this anywhere shared.
ALTER TABLE transactions DISABLE TRIGGER before_transaction_split_snapshot_insert;
INSERT INTO transactions (transaction_id, user_id, tenant_id, amount, currency, status, payment_method)
SELECT -512001, id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'pending', 'mock' FROM _snapshot_test_user;
INSERT INTO transactions (transaction_id, user_id, tenant_id, amount, currency, status, payment_method)
SELECT -512002, id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'successful', 'mock' FROM _snapshot_test_user;
ALTER TABLE transactions ENABLE TRIGGER before_transaction_split_snapshot_insert;

SELECT CASE WHEN COUNT(*) FILTER (WHERE school_percentage_snapshot IS NULL) = 2
  THEN 'SETUP: both legacy rows start with a NULL snapshot, as intended'
  ELSE 'SETUP BROKEN: expected 2 NULL snapshots, got ' || COUNT(*) FILTER (WHERE school_percentage_snapshot IS NULL)::text
END AS result
FROM transactions WHERE transaction_id IN (-512001, -512002);

-- 4. THE CASE A BEFORE INSERT TRIGGER WOULD MISS: a legacy NULL row turned into a
--    platform-settled transaction by the webhook activation path
--    (webhook-dispatch.ts sets status + payment_provider on an existing row).
UPDATE transactions
SET status = 'successful', payment_provider = 'paypal'
WHERE transaction_id = -512001
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 4: provider activation filled the snapshot (70) — the BEFORE INSERT gap'
    ELSE 'FAIL 4: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 70'
  END AS result;

-- 5. A later UPDATE must NOT re-stamp an existing snapshot, even once the tenant's
--    split has changed. Re-stamping would be the #496 bug.
UPDATE revenue_splits SET school_percentage = 90, platform_percentage = 10
WHERE tenant_id = '00000000-0000-0000-0000-0000000005a1';

UPDATE transactions SET status = 'refunded'
WHERE transaction_id = -512001
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 5: existing snapshot untouched by a later update (still 70, split now 90)'
    ELSE 'FAIL 5: snapshot was re-stamped to ' || COALESCE(school_percentage_snapshot::text, 'NULL')
  END AS result;

-- 6. Tampering with an ALREADY-SNAPSHOTTED row is reverted, not accepted.
UPDATE transactions SET school_percentage_snapshot = 100
WHERE transaction_id = -512001
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 6: update tampering with an existing snapshot reverted to 70'
    ELSE 'FAIL 6: snapshot became ' || COALESCE(school_percentage_snapshot::text, 'NULL')
  END AS result;

-- 7. A legacy NULL row is NOT lazily backfilled by an incidental update — neither
--    by an ordinary status change nor by a caller trying to set the value. Doing
--    so would stamp TODAY's split (now 90) onto a historical sale, one row at a
--    time, which is the repricing #496 removed.
UPDATE transactions SET status = 'archived'
WHERE transaction_id = -512002;

UPDATE transactions SET school_percentage_snapshot = 100
WHERE transaction_id = -512002
RETURNING
  CASE WHEN school_percentage_snapshot IS NULL
    THEN 'PASS 7: legacy NULL row still NULL after an incidental update and a tamper attempt'
    ELSE 'FAIL 7: snapshot became ' || school_percentage_snapshot::text || ' (expected NULL)'
  END AS result;

ROLLBACK;
