/**
 * Guards the one thing about #512's database backstop that CAN be checked
 * without a database: the fallback percentage is duplicated between the
 * migration's plpgsql and the TypeScript constant, and nothing else would
 * notice if the two drifted apart.
 *
 * The trigger's actual behaviour is SQL, and this suite runs
 * `environment: 'node'` with no database — see
 * `supabase/snippets/verify_transaction_split_snapshot_backstop.sql` for the
 * executable coverage of insert-fills, explicit-value-wins, the webhook UPDATE
 * path, and the never-re-stamp rule.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_SCHOOL_PERCENTAGE } from '@/lib/payments/payouts-owed'

const MIGRATION = resolve(
  __dirname,
  '../../supabase/migrations/20260725110000_transaction_split_snapshot_backstop.sql',
)

describe('#512 transaction split snapshot backstop', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('encodes the same fallback percentage the app layer uses', () => {
    const match = sql.match(/COALESCE\(v_school_percentage,\s*(\d+)\)/)
    expect(match, 'COALESCE fallback not found in the migration').not.toBeNull()
    expect(Number(match![1])).toBe(DEFAULT_SCHOOL_PERCENTAGE)
  })

  it('fires on UPDATE as well as INSERT', () => {
    // payment_provider is set post-insert by the webhook activation path
    // (lib/payments/webhook-dispatch.ts), so an INSERT-only trigger would let a
    // row become platform-settled while its snapshot is still NULL.
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE ON transactions/)
  })

  it('only fires while the snapshot is still NULL, so history is never re-stamped', () => {
    expect(sql).toMatch(/WHEN \(NEW\.school_percentage_snapshot IS NULL\)/)
  })

  it('does not backfill existing rows', () => {
    // Backfilling would stamp today's split onto historical transactions —
    // exactly the retroactive repricing #496 removed.
    expect(sql).not.toMatch(/UPDATE\s+transactions\s+SET/i)
  })
})
