#!/usr/bin/env tsx
/**
 * Issue #541 — assert that the CLOUD database matches what this repo claims.
 *
 * WHY THIS EXISTS. The `transactions` INSERT lockdown (#538 /
 * `20260725180000_transactions_insert_lockdown.sql`) sat unapplied on cloud
 * while every signal a developer normally trusts said it had shipped: the
 * migration was in `supabase/migrations/`, the PR was merged, and the unit
 * suite was green. None of those touch the database —
 * `tests/unit/transaction-split-snapshot-backstop.test.ts` says so in its own
 * header ("a green run of this file means nothing about whether the migration
 * was ever applied").
 *
 * It got lost because sibling migrations had been applied through the MCP
 * `apply_migration` tool, which stamps `supabase_migrations.schema_migrations`
 * with a FRESH timestamp instead of the repo filename. Once the ledger holds
 * stamps that match no file, "diff the repo against the ledger" produces false
 * positives — and a genuinely missing migration hides in the noise. See
 * `docs/MIGRATIONS.md`.
 *
 * So this asserts two different things, and both matter:
 *
 *   A. LEDGER INTEGRITY — every repo migration is stamped on cloud under its own
 *      filename, and cloud carries no stamp matching no file. This is what makes
 *      drift detectable at all; without it the other checks only cover the
 *      invariants someone thought to write down.
 *
 *   B. THE #528/#538 PAYMENT INVARIANTS — asserted against the LIVE grant and
 *      policy state, not migration text, so a later migration re-widening things
 *      (or a schema dump re-applying the original `GRANT ALL ... TO
 *      authenticated` from 20260126190500_lms_complete.sql) fails here too.
 *
 * RUN IT:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... npm run verify:cloud
 *
 * The token is a Supabase personal access token
 * (https://supabase.com/dashboard/account/tokens). This goes over the Management
 * API deliberately rather than a Postgres connection: the pooler on port 5432 is
 * blocked on some networks this project is developed from, which is the same
 * reason `docs/MIGRATIONS.md` documents an HTTPS fallback for pushes.
 *
 * The rules themselves live in `scripts/lib/verify-cloud-schema-checks.ts` and
 * are unit-tested in `tests/unit/verify-cloud-schema.test.ts`.
 *
 * Exit codes: 0 all checks passed · 1 drift detected · 2 could not run.
 */

import { readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  evaluateChecks,
  type CloudFacts,
  type InsertPolicy,
  type TransactionPrivileges,
  type TriggerState,
} from './lib/verify-cloud-schema-checks.ts'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations')

try {
  process.loadEnvFile(resolve(REPO_ROOT, '.env.local'))
} catch {
  // Absent in CI; the vars below may still be supplied directly.
}

const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ??
  process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1] ??
  'tcqqnjfwmbfwcyhafbbt'

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN

async function query<T>(sql: string): Promise<T[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  )

  if (!res.ok) {
    throw new Error(
      `Management API ${res.status} ${res.statusText}: ${await res.text()}`
    )
  }
  return (await res.json()) as T[]
}

async function collectFacts(): Promise<CloudFacts> {
  const repoVersions = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => f.split('_')[0])
    .sort()

  const ledgerRows = await query<{ version: string }>(
    'select version from supabase_migrations.schema_migrations order by version'
  )

  const [priv] = await query<TransactionPrivileges>(`
    select
      has_table_privilege('authenticated','public.transactions','INSERT') as auth_insert,
      has_table_privilege('anon','public.transactions','INSERT')          as anon_insert,
      has_table_privilege('service_role','public.transactions','INSERT')  as service_insert,
      (
        select string_agg(a.attname, ', ' order by a.attname)
        from pg_attribute a
        where a.attrelid = 'public.transactions'::regclass
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attname, 'INSERT')
      ) as auth_col_insert,
      (
        select string_agg(a.attname, ', ' order by a.attname)
        from pg_attribute a
        where a.attrelid = 'public.transactions'::regclass
          and a.attnum > 0 and not a.attisdropped
          and has_column_privilege('authenticated', a.attrelid, a.attname, 'UPDATE')
      ) as auth_col_update
  `)

  const insertPolicies = await query<InsertPolicy>(`
    select polname as policyname, pg_get_expr(polwithcheck, polrelid) as with_check
    from pg_policy
    where polrelid = 'public.transactions'::regclass and polcmd = 'a'
  `)

  const triggers = await query<TriggerState>(`
    select t.tgname, (t.tgenabled <> 'D') as enabled
    from pg_trigger t
    where t.tgrelid = 'public.transactions'::regclass
      and not t.tgisinternal
      and t.tgname in ('before_transaction_split_snapshot_insert',
                       'before_transaction_split_snapshot_update')
  `)

  return {
    ledger: { repoVersions, cloudVersions: ledgerRows.map((r) => r.version) },
    priv,
    insertPolicies,
    triggers,
  }
}

async function main() {
  if (!ACCESS_TOKEN) {
    console.error(
      'SUPABASE_ACCESS_TOKEN is not set.\n\n' +
        'Create a personal access token at https://supabase.com/dashboard/account/tokens\n' +
        'then re-run:\n\n' +
        '  SUPABASE_ACCESS_TOKEN=sbp_... npm run verify:cloud\n'
    )
    process.exit(2)
  }

  console.log(`Verifying cloud project ${PROJECT_REF}\n`)

  const checks = evaluateChecks(await collectFacts())

  const width = Math.max(...checks.map((c) => c.name.length))
  for (const c of checks) {
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(width)}  ${c.detail}`)
  }

  const failed = checks.filter((c) => !c.ok)
  console.log()
  if (failed.length) {
    console.error(
      `${failed.length} of ${checks.length} checks FAILED.\n` +
        'Cloud does not match this repo. See docs/MIGRATIONS.md — cloud changes go\n' +
        'through `supabase db push`, never through ad-hoc apply_migration.'
    )
    process.exit(1)
  }
  console.log(`All ${checks.length} checks passed.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(2)
})
