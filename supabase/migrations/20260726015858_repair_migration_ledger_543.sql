-- Ledger repair for #543, reconstructed to close an orphan stamp (#541 follow-up).
--
-- This SQL was applied to cloud on 2026-07-26 through the MCP `apply_migration`
-- tool while #543 was being worked, but no matching file was committed. The
-- statement below is reproduced verbatim from
-- `supabase_migrations.schema_migrations.statements` for version 20260726015858;
-- only this header has been added.
--
-- Same shape as its sibling 20260726013256_repair_migration_ledger_542.sql:
-- `apply_migration` stamps a FRESH timestamp instead of the migration's
-- filename, so #543's repair correctly realigned `write_side_entitlement_gates`
-- and then became an orphan stamp itself (20260726015858 matched no file).
-- Committing the file is what closes the loop.
--
-- Idempotent: on a fresh `supabase db reset` the UPDATE matches nothing, because
-- the CLI stamps 20260726110000 from the filename in the first place. It is a
-- no-op everywhere except the cloud project it has already run on.

-- Ledger repair for #543. `apply_migration` stamps a fresh timestamp rather than
-- the repo filename (see #541), so 20260726110000_write_side_entitlement_gates.sql
-- landed as version 20260726015553. Realign the version with the file so
-- repo-vs-ledger diffing stops reporting it as pending.
UPDATE supabase_migrations.schema_migrations
SET version = '20260726110000'
WHERE name = 'write_side_entitlement_gates'
  AND version = '20260726015553';
