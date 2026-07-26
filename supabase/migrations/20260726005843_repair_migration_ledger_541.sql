-- Issue #541 — repair the cloud migration ledger.
--
-- Four migrations were applied through the MCP `apply_migration` tool, which
-- stamps supabase_migrations.schema_migrations with a FRESH timestamp instead of
-- the migration's own filename. A fifth (20260725180000_transactions_insert_lockdown)
-- was never applied at all and hid among the four false positives:
--
--   repo file                                        cloud stamp before this
--   20260721120000_add_binance_personal_provider     20260725213441
--   20260725110000_transaction_split_snapshot_backstop  20260725213508
--   20260725160000_entitlement_gated_enrollment_inserts 20260725213610
--   20260725170000_transactions_column_hardening     20260725192946
--   20260725180000_transactions_insert_lockdown      (never applied)
--
-- The DDL of all four was confirmed genuinely live by querying what it created
-- (the 'binance_personal' CHECK value on products.payment_provider,
-- has_course_access() in the enrollments INSERT policy, both
-- before_transaction_split_snapshot_* triggers, and the three-column
-- authenticated UPDATE grant on transactions) BEFORE this repair was written.
-- So this re-stamps the ledger only; it re-runs no DDL.
--
-- 20260725180000's DDL was applied separately in this same issue, which is why
-- its stamp is inserted here rather than moved.
--
-- Idempotent by construction: on a fresh database (`supabase db reset`) the four
-- UPDATEs match nothing, and 20260725180000 is already stamped by the time this
-- file runs, so the INSERT no-ops. Safe to re-run anywhere.
--
-- The rule this incident produced is in docs/MIGRATIONS.md: cloud changes go
-- through `supabase db push`, never through ad-hoc apply_migration, precisely
-- because the latter breaks drift detection. `npm run verify:cloud` now fails
-- loudly if it happens again.

UPDATE supabase_migrations.schema_migrations
   SET version = '20260721120000'
 WHERE version = '20260725213441' AND name = 'add_binance_personal_provider';

UPDATE supabase_migrations.schema_migrations
   SET version = '20260725110000'
 WHERE version = '20260725213508' AND name = 'transaction_split_snapshot_backstop';

UPDATE supabase_migrations.schema_migrations
   SET version = '20260725160000'
 WHERE version = '20260725213610' AND name = 'entitlement_gated_enrollment_inserts';

UPDATE supabase_migrations.schema_migrations
   SET version = '20260725170000'
 WHERE version = '20260725192946' AND name = 'transactions_column_hardening';

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('20260725180000', 'transactions_insert_lockdown')
ON CONFLICT (version) DO NOTHING;
