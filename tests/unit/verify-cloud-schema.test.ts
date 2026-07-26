/**
 * Issue #541 — proof that `npm run verify:cloud` actually FAILS on drift.
 *
 * The acceptance criterion for #541 is that the drift check "fails if you
 * manually re-grant INSERT". Demonstrating that against the live project would
 * mean briefly restoring a write grant on the payments table of the only
 * production database this project has, purely to watch a script go red. These
 * fixtures do it repeatably and in CI instead, with no window where the grant is
 * open.
 *
 * The HEALTHY fixture is not invented: it is the exact catalog state read back
 * from the cloud project on 2026-07-26 after
 * `20260725180000_transactions_insert_lockdown.sql` was applied — including how
 * Postgres renders the policy expression back (`'pending'::transaction_status`),
 * which is the part a hand-written fixture would get wrong.
 *
 * Note this suite shares the limitation of its neighbours: it proves the RULES
 * are right, not that cloud satisfies them. Only `npm run verify:cloud` does
 * that, because only it queries the database.
 */
import { describe, it, expect } from 'vitest'

import {
  evaluateChecks,
  normalisePolicyExpr,
  EXPECTED_UPDATE_COLS,
  type CloudFacts,
} from '@/scripts/lib/verify-cloud-schema-checks'

/** Exactly what cloud returned after the lockdown was applied. */
const LIVE_WITH_CHECK =
  "((( SELECT auth.uid() AS uid) = user_id) AND (tenant_id = ( SELECT get_tenant_id() AS get_tenant_id)) " +
  "AND (status = 'pending'::transaction_status) AND (settlement_currency IS NULL) " +
  'AND (settlement_base IS NULL) AND (settlement_mint IS NULL) AND (settlement_sol_usd IS NULL))'

/** The #528 shape that was live on cloud BEFORE this issue was fixed. */
const PRE_FIX_WITH_CHECK =
  "((( SELECT auth.uid() AS uid) = user_id) AND (tenant_id = ( SELECT get_tenant_id() AS get_tenant_id)) " +
  "AND (status = 'pending'::transaction_status))"

function healthy(): CloudFacts {
  return {
    ledger: {
      repoVersions: ['20260725170000', '20260725180000'],
      cloudVersions: ['20260725170000', '20260725180000'],
    },
    priv: {
      auth_insert: false,
      anon_insert: false,
      service_insert: true,
      auth_col_insert: null,
      auth_col_update: EXPECTED_UPDATE_COLS,
    },
    insertPolicies: [
      { policyname: 'Users can create own transactions', with_check: LIVE_WITH_CHECK },
    ],
    triggers: [
      { tgname: 'before_transaction_split_snapshot_insert', enabled: true },
      { tgname: 'before_transaction_split_snapshot_update', enabled: true },
    ],
  }
}

const failuresOf = (facts: CloudFacts) =>
  evaluateChecks(facts).filter((c) => !c.ok)

describe('verify-cloud-schema checks', () => {
  it('passes on the state cloud is actually in after #541', () => {
    expect(failuresOf(healthy())).toEqual([])
  })

  it('normalises the catalog rendering so type annotations do not break pin matching', () => {
    expect(normalisePolicyExpr("(status = 'pending'::transaction_status)")).toContain(
      "status = 'pending'"
    )
  })

  // --- the criterion #541 names explicitly ---------------------------------

  it('FAILS when INSERT is re-granted to authenticated', () => {
    const facts = healthy()
    facts.priv.auth_insert = true

    const failures = failuresOf(facts)
    expect(failures).toHaveLength(1)
    expect(failures[0].name).toContain('authenticated holds no INSERT')
    expect(failures[0].detail).toContain('GRANT IS PRESENT')
  })

  it('FAILS when INSERT is re-granted to anon', () => {
    const facts = healthy()
    facts.priv.anon_insert = true
    expect(failuresOf(facts).map((f) => f.name)).toContain(
      'anon holds no INSERT on transactions (#538)'
    )
  })

  it('FAILS when a column-level INSERT grant is reintroduced without the table grant', () => {
    const facts = healthy()
    facts.priv.auth_col_insert = 'amount, settlement_base'
    const failures = failuresOf(facts)
    expect(failures).toHaveLength(1)
    expect(failures[0].detail).toContain('settlement_base')
  })

  // --- the shape that was actually live before this fix --------------------

  it('FAILS on the pre-fix #528 policy, which omits the four settlement pins', () => {
    const facts = healthy()
    facts.insertPolicies = [
      { policyname: 'Users can create own transactions', with_check: PRE_FIX_WITH_CHECK },
    ]

    const failures = failuresOf(facts)
    expect(failures).toHaveLength(1)
    expect(failures[0].detail).toContain('settlement_base IS NULL')
    expect(failures[0].detail).toContain('settlement_currency IS NULL')
    expect(failures[0].detail).toContain('settlement_mint IS NULL')
    expect(failures[0].detail).toContain('settlement_sol_usd IS NULL')
  })

  it('FAILS when the INSERT policy is dropped entirely', () => {
    const facts = healthy()
    facts.insertPolicies = []
    expect(failuresOf(facts).map((f) => f.detail)).toContain(
      'no INSERT policy found on public.transactions'
    )
  })

  // --- the #528 UPDATE half ------------------------------------------------

  it('FAILS when the UPDATE column grant is widened', () => {
    const facts = healthy()
    facts.priv.auth_col_update = `amount, settlement_base, ${EXPECTED_UPDATE_COLS}`
    const failures = failuresOf(facts)
    expect(failures).toHaveLength(1)
    expect(failures[0].name).toContain('UPDATE grant is exactly')
  })

  it('FAILS when service_role loses INSERT, which would break every payment write', () => {
    const facts = healthy()
    facts.priv.service_insert = false
    expect(failuresOf(facts)[0].detail).toContain('every payment write path is broken')
  })

  // --- the #512 split-snapshot triggers ------------------------------------

  it('FAILS when a split-snapshot trigger is missing or disabled', () => {
    const missing = healthy()
    missing.triggers = missing.triggers.filter(
      (t) => t.tgname !== 'before_transaction_split_snapshot_update'
    )
    expect(failuresOf(missing)[0].detail).toBe('MISSING')

    const disabled = healthy()
    disabled.triggers[0].enabled = false
    expect(failuresOf(disabled)[0].detail).toBe('DISABLED')
  })

  // --- ledger drift: the root cause #541 was filed for ---------------------

  it('FAILS when a repo migration was never applied to cloud', () => {
    const facts = healthy()
    facts.ledger.cloudVersions = ['20260725170000'] // 180000 never applied

    const failures = failuresOf(facts)
    expect(failures).toHaveLength(1)
    expect(failures[0].detail).toContain('20260725180000')
  })

  it('FAILS on an orphan stamp — the ad-hoc apply_migration signature', () => {
    const facts = healthy()
    // What cloud actually looked like: applied, but stamped with a fresh
    // timestamp that matches no file in supabase/migrations/.
    facts.ledger.cloudVersions = ['20260725170000', '20260725192946']

    const failures = failuresOf(facts)
    expect(failures.map((f) => f.detail.slice(0, 20))).toEqual([
      expect.stringContaining('not on cloud'),
      expect.stringContaining('orphan stamps'),
    ])
    expect(failures[1].detail).toContain('20260725192946')
  })

  it('reports the real pre-#541 cloud ledger as drifted on both counts', () => {
    // The genuine numbers from the issue: four stamps applied ad hoc, one
    // migration never applied at all.
    const facts = healthy()
    facts.ledger = {
      repoVersions: [
        '20260721120000',
        '20260725110000',
        '20260725160000',
        '20260725170000',
        '20260725180000',
      ],
      cloudVersions: [
        '20260725192946',
        '20260725213441',
        '20260725213508',
        '20260725213610',
      ],
    }

    const failures = failuresOf(facts)
    expect(failures).toHaveLength(2)
    // Every repo file reads as pending, which is exactly why the genuinely
    // missing 20260725180000 was invisible in the noise.
    expect(failures[0].detail).toContain('20260725180000')
    expect(failures[1].detail).toContain('20260725213441')
  })
})
