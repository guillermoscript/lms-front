/**
 * Issue #541 — the assertion half of `npm run verify:cloud`, kept pure.
 *
 * Split out from `scripts/verify-cloud-schema.ts` so the rules can be exercised
 * without a network round-trip or a live database. That matters here for a
 * specific reason: the acceptance criterion for #541 is "the check FAILS if you
 * re-grant INSERT", and the honest way to demonstrate that is a test that feeds
 * in a re-granted fixture — not briefly re-opening a write grant on the
 * payments table of the only production database this project has.
 *
 * `tests/unit/verify-cloud-schema.test.ts` drives every rule below from both a
 * healthy fixture and a drifted one.
 */

export type MigrationLedger = {
  /** Version prefixes of `supabase/migrations/*.sql`, e.g. `20260725180000`. */
  repoVersions: string[]
  /** `version` column of `supabase_migrations.schema_migrations` on cloud. */
  cloudVersions: string[]
}

export type TransactionPrivileges = {
  auth_insert: boolean
  anon_insert: boolean
  service_insert: boolean
  /** Comma-joined column list, or null when no column-level grant exists. */
  auth_col_insert: string | null
  auth_col_update: string | null
}

export type InsertPolicy = { policyname: string; with_check: string | null }
export type TriggerState = { tgname: string; enabled: boolean }

export type CloudFacts = {
  ledger: MigrationLedger
  priv: TransactionPrivileges
  insertPolicies: InsertPolicy[]
  triggers: TriggerState[]
}

export type Check = { name: string; ok: boolean; detail: string }

/** The exact `authenticated` UPDATE column grant #528 established. */
export const EXPECTED_UPDATE_COLS =
  'provider_subscription_id, status, stripe_payment_intent_id'

/** What the #538 INSERT policy must pin. Rendered form, after normalisation. */
export const REQUIRED_POLICY_PINS = [
  "status = 'pending'",
  'settlement_currency IS NULL',
  'settlement_base IS NULL',
  'settlement_mint IS NULL',
  'settlement_sol_usd IS NULL',
]

export const SPLIT_SNAPSHOT_TRIGGERS = [
  'before_transaction_split_snapshot_insert',
  'before_transaction_split_snapshot_update',
]

/**
 * Strip the catalog's type annotations and collapse whitespace, so a pin written
 * `status = 'pending'` matches how Postgres renders it back
 * (`status = 'pending'::transaction_status`).
 */
export function normalisePolicyExpr(expr: string): string {
  return expr.replace(/::[a-z_]+/g, '').replace(/\s+/g, ' ')
}

export function evaluateChecks(facts: CloudFacts): Check[] {
  const checks: Check[] = []
  const add = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail })

  // -------------------------------------------------------------------------
  // A. Ledger integrity — what makes any future drift detectable at all.
  // -------------------------------------------------------------------------
  const cloudSet = new Set(facts.ledger.cloudVersions)
  const repoSet = new Set(facts.ledger.repoVersions)
  const pending = facts.ledger.repoVersions.filter((v) => !cloudSet.has(v))
  const orphans = facts.ledger.cloudVersions.filter((v) => !repoSet.has(v))

  add(
    'every repo migration is applied to cloud',
    pending.length === 0,
    pending.length
      ? `not on cloud: ${pending.join(', ')}`
      : `all ${facts.ledger.repoVersions.length} applied`
  )

  // An orphan stamp is the failure mode that hid #538: it matches no file, so it
  // pads the ledger and makes the pending list above untrustworthy.
  //
  // RUN THIS FROM `master`, AFTER MERGING. Both lists compare the ledger against
  // the migrations present on the CURRENT checkout, so on a feature branch every
  // migration another in-flight branch has already applied to cloud reads as an
  // orphan, and every migration on this branch not yet applied reads as pending.
  // Neither is drift. The detail line below says so rather than leaving someone
  // to rediscover it and conclude the check is noisy.
  add(
    'cloud carries no migration stamp that matches no repo file',
    orphans.length === 0,
    orphans.length
      ? `orphan stamps (applied ad hoc, not via db push — or applied by an ` +
        `in-flight branch this checkout does not have; re-check on master): ` +
        orphans.join(', ')
      : 'ledger matches repo filenames exactly'
  )

  // -------------------------------------------------------------------------
  // B. The #528 / #538 payment invariants, against live catalog state.
  // -------------------------------------------------------------------------
  add(
    'authenticated holds no INSERT on transactions (#538)',
    facts.priv.auth_insert === false,
    facts.priv.auth_insert
      ? 'GRANT IS PRESENT — a caller can open a self-priced row'
      : 'revoked'
  )

  add(
    'anon holds no INSERT on transactions (#538)',
    facts.priv.anon_insert === false,
    facts.priv.anon_insert ? 'GRANT IS PRESENT' : 'revoked'
  )

  // A table-level revoke leaves no column grants, but a later migration could
  // add one and reopen the path without restoring the table grant.
  add(
    'no column-level INSERT grant to authenticated survives',
    facts.priv.auth_col_insert === null,
    facts.priv.auth_col_insert ? `columns: ${facts.priv.auth_col_insert}` : '(none)'
  )

  // The lockdown must not have taken the server-side writers with it.
  add(
    'service_role retains INSERT (webhooks, reconcilers, crons, admin routes)',
    facts.priv.service_insert === true,
    facts.priv.service_insert
      ? 'granted'
      : 'REVOKED — every payment write path is broken'
  )

  add(
    `authenticated UPDATE grant is exactly (${EXPECTED_UPDATE_COLS}) (#528)`,
    facts.priv.auth_col_update === EXPECTED_UPDATE_COLS,
    `actual: ${facts.priv.auth_col_update ?? '(none)'}`
  )

  // The policy is unreachable while the grant is revoked. It is asserted anyway
  // because the revoke is one `GRANT INSERT` away from being undone, and these
  // pins are what keep the #538 under-quote impossible if that ever happens.
  if (facts.insertPolicies.length === 0) {
    add(
      'transactions INSERT policy pins status + all four settlement columns (#538)',
      false,
      'no INSERT policy found on public.transactions'
    )
  } else {
    for (const p of facts.insertPolicies) {
      const normalised = normalisePolicyExpr(p.with_check ?? '')
      const missing = REQUIRED_POLICY_PINS.filter((pin) => !normalised.includes(pin))
      add(
        `INSERT policy "${p.policyname}" pins status + all four settlement columns (#538)`,
        missing.length === 0,
        missing.length ? `missing pins: ${missing.join('; ')}` : 'all pins present'
      )
    }
  }

  for (const name of SPLIT_SNAPSHOT_TRIGGERS) {
    const row = facts.triggers.find((t) => t.tgname === name)
    add(
      `trigger ${name} exists and is enabled (#512)`,
      row?.enabled === true,
      !row ? 'MISSING' : row.enabled ? 'enabled' : 'DISABLED'
    )
  }

  return checks
}
