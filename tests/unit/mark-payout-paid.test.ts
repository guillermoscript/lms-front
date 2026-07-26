import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Issue #547 §4 — `markPayoutPaid` moves real money and had no direct coverage
 * at all (`grep -rl "markPayoutPaid" tests/` returned only comments).
 *
 * Two behaviours are pinned here:
 *
 *   1. **The mismatch guard at the `netOwed === 0` boundary.** Reachable only
 *      now that the residue fix lets a settled balance actually reach 0.
 *
 *   2. **Idempotency.** The `payouts` table's only uniqueness is
 *      UNIQUE (tenant_id, period_start, period_end), and a manual payout leaves
 *      both period columns NULL — which Postgres treats as distinct, so the
 *      constraint never fired. The dialog's `loading` flag was the only thing
 *      standing between an operator and a doubled wire, and it survives neither
 *      a reload, a second tab, a second super admin, nor a server-action retry.
 *      A duplicate can't even be corrected afterwards: `CHECK (amount > 0)`
 *      forbids a compensating negative row.
 */

const inserts: Record<string, unknown>[] = []
let insertError: { code?: string; message: string } | null = null
/** Rows the paged `transactions` read returns; everything else reads empty. */
let txRows: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: async () => true }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: async () => 'super-admin-1' }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

vi.mock('@/lib/supabase/fetch-all-rows', () => ({
  fetchAllRows: async (relation: string) => {
    if (relation === 'tenants') return [{ id: 't1', name: 'School A' }]
    if (relation === 'revenue_splits') return [{ tenant_id: 't1', school_percentage: 80 }]
    if (relation === 'transactions') return txRows
    return []
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (values: Record<string, unknown>) => {
        inserts.push(values)
        return Promise.resolve({ error: insertError })
      },
      select: () => ({ order: () => ({ range: () => Promise.resolve({ data: [], error: null, count: 0 }) }) }),
    }),
  }),
}))

const { markPayoutPaid } = await import('@/app/actions/platform/payouts')

beforeEach(() => {
  inserts.length = 0
  insertError = null
  txRows = []
})

describe('markPayoutPaid — the mismatch guard at netOwed === 0', () => {
  it('challenges a payout to a school that is owed nothing, and records no row', async () => {
    const result = await markPayoutPaid('t1', 50, 'usd')
    expect(result).toEqual({ status: 'warning', netOwed: 0 })
    expect(inserts).toHaveLength(0)
  })

  it('records the payout once the operator confirms the warning', async () => {
    const result = await markPayoutPaid('t1', 50, 'usd', 'goodwill', true, 'key-1')
    expect(result).toEqual({ status: 'ok' })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      tenant_id: 't1',
      amount: 50,
      currency: 'usd',
      payout_method: 'manual',
      status: 'paid',
      idempotency_key: 'key-1',
    })
  })

  it('lets an exact settlement of an outstanding balance through unchallenged', async () => {
    // One $49.99 PayPal sale at 80% owes exactly 39.99 after the residue fix.
    txRows = [{
      tenant_id: 't1', payment_provider: 'paypal', amount: 49.99, refunded_amount: 0,
      currency: 'usd', school_percentage_snapshot: 80, status: 'successful',
      transaction_date: '2026-07-01T00:00:00Z',
    }]
    const result = await markPayoutPaid('t1', 39.99, 'usd')
    expect(result).toEqual({ status: 'ok' })
    expect(inserts).toHaveLength(1)
  })

  it('challenges a mistyped extra zero against a real balance', async () => {
    txRows = [{
      tenant_id: 't1', payment_provider: 'paypal', amount: 49.99, refunded_amount: 0,
      currency: 'usd', school_percentage_snapshot: 80, status: 'successful',
      transaction_date: '2026-07-01T00:00:00Z',
    }]
    const result = await markPayoutPaid('t1', 399.9, 'usd')
    expect(result).toEqual({ status: 'warning', netOwed: 39.99 })
    expect(inserts).toHaveLength(0)
  })
})

describe('markPayoutPaid — idempotency', () => {
  it('#547: a replayed submission returns ok instead of erroring, so one wire = one row', async () => {
    // Second attempt with the same key: the partial unique index rejects it with
    // 23505. The operator asked for one payout and one payout exists, so this is
    // success — surfacing an error here would invite them to "fix" it by
    // recording another.
    insertError = { code: '23505', message: 'duplicate key value violates unique constraint "idx_payouts_manual_idempotency"' }
    const result = await markPayoutPaid('t1', 50, 'usd', undefined, true, 'key-1')
    expect(result).toEqual({ status: 'ok' })
  })

  it('still throws on any OTHER database error', async () => {
    insertError = { code: '23503', message: 'insert or update violates foreign key constraint' }
    await expect(markPayoutPaid('t1', 50, 'usd', undefined, true, 'key-2')).rejects.toThrow(
      /foreign key constraint/,
    )
  })

  it('rejects a non-positive amount before touching the database', async () => {
    await expect(markPayoutPaid('t1', 0, 'usd', undefined, true, 'key-3')).rejects.toThrow(
      /must be positive/,
    )
    expect(inserts).toHaveLength(0)
  })
})
