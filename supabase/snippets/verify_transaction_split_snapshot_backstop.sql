-- Verification for 20260725110000_transaction_split_snapshot_backstop.sql (#512).
--
-- The repo's vitest suite runs `environment: 'node'` with no database, so the
-- trigger cannot be covered there. Run this against a database that has the
-- migration applied; every SELECT below prints PASS or FAIL. It rolls itself
-- back, so it is safe to run against a populated environment.
--
-- transactions.user_id is NOT NULL and references auth.users, so this borrows an
-- existing user rather than creating one. It also fires the pre-existing AFTER
-- INSERT/UPDATE trigger `after_transaction_insert` / `after_transaction_update`
-- (trigger_manage_transactions) — harmless here since the rows carry neither
-- product_id nor plan_id, and the whole thing is rolled back regardless.

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

-- 2. An explicit app-layer snapshot is never overwritten.
INSERT INTO transactions (user_id, tenant_id, amount, currency, status, payment_method, school_percentage_snapshot)
SELECT id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'successful', 'mock', 55 FROM _snapshot_test_user
RETURNING
  CASE WHEN school_percentage_snapshot = 55
    THEN 'PASS 2: explicit snapshot preserved (55)'
    ELSE 'FAIL 2: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 55'
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

-- 4. THE CASE A BEFORE INSERT TRIGGER WOULD MISS: a row that starts with a NULL
--    snapshot and is later turned into a platform-settled transaction by the
--    webhook activation path (webhook-dispatch.ts sets status + payment_provider
--    on an existing row).
--    The trigger is temporarily disabled for the insert so the row genuinely
--    starts NULL, reproducing a pre-migration row.
ALTER TABLE transactions DISABLE TRIGGER before_transaction_split_snapshot;
INSERT INTO transactions (transaction_id, user_id, tenant_id, amount, currency, status, payment_method)
SELECT -512001, id, '00000000-0000-0000-0000-0000000005a1', 100, 'usd', 'pending', 'mock' FROM _snapshot_test_user;
ALTER TABLE transactions ENABLE TRIGGER before_transaction_split_snapshot;

SELECT CASE WHEN school_percentage_snapshot IS NULL
  THEN 'SETUP 4: row starts with NULL snapshot, as intended'
  ELSE 'SETUP 4 BROKEN: expected NULL, got ' || school_percentage_snapshot::text
END AS result
FROM transactions WHERE transaction_id = -512001;

UPDATE transactions
SET status = 'successful', payment_provider = 'paypal'
WHERE transaction_id = -512001
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 4: webhook UPDATE filled the snapshot (70) — the BEFORE INSERT gap'
    ELSE 'FAIL 4: got ' || COALESCE(school_percentage_snapshot::text, 'NULL') || ', expected 70'
  END AS result;

-- 5. A later UPDATE must NOT re-stamp an existing snapshot, even if the tenant's
--    split has since changed. Re-stamping would be the #496 bug.
UPDATE revenue_splits SET school_percentage = 90, platform_percentage = 10
WHERE tenant_id = '00000000-0000-0000-0000-0000000005a1';

UPDATE transactions SET status = 'refunded'
WHERE transaction_id = -512001
RETURNING
  CASE WHEN school_percentage_snapshot = 70
    THEN 'PASS 5: existing snapshot untouched by a later update (still 70, split now 90)'
    ELSE 'FAIL 5: snapshot was re-stamped to ' || COALESCE(school_percentage_snapshot::text, 'NULL')
  END AS result;

ROLLBACK;
