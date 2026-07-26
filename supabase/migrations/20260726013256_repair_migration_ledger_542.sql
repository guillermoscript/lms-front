-- Ledger repair for #542, reconstructed to close an orphan stamp (#541 follow-up).
--
-- This SQL was applied to cloud on 2026-07-26 through the MCP `apply_migration`
-- tool while #542 was being worked, but no matching file was committed. The
-- statement below is reproduced verbatim from
-- `supabase_migrations.schema_migrations.statements` for version 20260726013256;
-- only this header has been added.
--
-- WHY THE FILE HAS TO EXIST. `apply_migration` stamps a FRESH timestamp instead
-- of the migration's filename, so #542's repair correctly realigned
-- `rls_exam_child_tables_tenant_gate` — and then became an orphan stamp itself,
-- because the repair carried a stamp (20260726013256) that matched no file in
-- supabase/migrations/. Net effect: one orphan traded for another. Committing
-- the file is what actually closes the loop, and is why #541's own repair
-- shipped as 20260726005843_repair_migration_ledger_541.sql.
--
-- `npm run verify:cloud` reports exactly this condition ("cloud carries no
-- migration stamp that matches no repo file"), which is how it was caught.
--
-- Idempotent: on a fresh `supabase db reset` the UPDATE matches nothing, because
-- the CLI stamps 20260726100000 from the filename in the first place. It is a
-- no-op everywhere except the cloud project it has already run on.

-- The MCP apply_migration stamps a fresh timestamp rather than the repo
-- filename's, which makes the repo migration look absent from cloud to any
-- drift check that compares versions (#541). Realign this one row with
-- supabase/migrations/20260726100000_rls_exam_child_tables_tenant_gate.sql.
UPDATE supabase_migrations.schema_migrations
   SET version = '20260726100000'
 WHERE name = 'rls_exam_child_tables_tenant_gate'
   AND version = '20260726013216';
