/**
 * STATIC DRIFT GUARDS — not behavioural coverage.
 *
 * #512's backstop is a plpgsql trigger, and this suite runs
 * `environment: 'node'` with no database, so nothing here proves the trigger
 * works; these assertions read the migration as text. They exist for the one
 * failure mode that text can catch: the fallback percentage is duplicated
 * between the plpgsql and the TypeScript constant, and nothing else would
 * notice if the two drifted apart.
 *
 * The behavioural coverage — insert computes, caller-supplied values are
 * overridden, existing snapshots are frozen, legacy NULLs fill only on provider
 * activation — lives in
 * `supabase/snippets/verify_transaction_split_snapshot_backstop.sql` and has to
 * be run against a local database. A green run of this file means nothing about
 * whether the migration was ever applied.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'

const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260725110000_transaction_split_snapshot_backstop.sql',
)

describe('#512 transaction split snapshot backstop (static drift guards)', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('encodes the same fallback percentage the app layer uses', () => {
    const match = sql.match(/COALESCE\(v_school_percentage,\s*(\d+)\)/)
    expect(match, 'COALESCE fallback not found in the migration').not.toBeNull()
    expect(Number(match![1])).toBe(DEFAULT_SCHOOL_PERCENTAGE)
  })

  it('covers UPDATE as well as INSERT', () => {
    // payment_provider — the field getPayoutsOwed() filters on — is set
    // post-insert by the webhook activation path (lib/payments/webhook-dispatch.ts),
    // so an INSERT-only backstop would let a row become platform-settled while
    // its snapshot is still NULL.
    expect(sql).toMatch(/BEFORE INSERT ON transactions/)
    expect(sql).toMatch(/BEFORE UPDATE ON transactions/)
  })

  it('leaves the INSERT trigger unconditional, so a caller-supplied value cannot survive', () => {
    // `transactions` grants ALL to `authenticated` and its RLS policies restrict
    // rows, not columns — a WHEN (NEW.school_percentage_snapshot IS NULL) guard
    // here would hand the number to the one writer we do not trust.
    const insertTrigger = sql.slice(sql.indexOf('BEFORE INSERT ON transactions'))
    const insertStatement = insertTrigger.slice(0, insertTrigger.indexOf(';'))
    expect(insertStatement).not.toMatch(/WHEN\s*\(/i)
  })
})
