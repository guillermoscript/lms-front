import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * `createPaymentRequest` idempotency (#754). A double-click or a retry used
 * to leave the admin with duplicate payment requests for the same student +
 * item, and confirming the second one failed the partial unique index. The
 * action now returns the existing OPEN request (pending / contacted /
 * payment_received) instead of inserting a second one, and a 23505 lost race
 * re-reads and returns the winner instead of surfacing an error.
 */

type Row = Record<string, unknown>
interface Call {
  table: string
  op: 'select' | 'insert' | 'update'
  values?: Row
  filters: { eq: [string, unknown][]; is: [string, unknown][]; in: [string, unknown[]][]; limit?: number }
}

function makeClient(handler: (call: Call) => { data: unknown; error: unknown }) {
  function builder(table: string) {
    let op: Call['op'] = 'select'
    let values: Row | undefined
    const filters: Call['filters'] = { eq: [], is: [], in: [] }
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => {
        op = 'insert'
        values = v
        return b
      },
      update: (v: Row) => {
        op = 'update'
        values = v
        return b
      },
      eq: (col: string, val: unknown) => {
        filters.eq.push([col, val])
        return b
      },
      is: (col: string, val: unknown) => {
        filters.is.push([col, val])
        return b
      },
      in: (col: string, vals: unknown[]) => {
        filters.in.push([col, vals])
        return b
      },
      limit: (n: number) => {
        filters.limit = n
        return b
      },
      order: () => b,
      single: () => Promise.resolve(handler({ table, op, values, filters })),
      maybeSingle: () => Promise.resolve(handler({ table, op, values, filters })),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(handler({ table, op, values, filters })).then(resolve),
    }
    return b
  }
  return { from: (t: string) => builder(t) }
}

const USER_ID = 'user-1'
const TENANT_ID = 'tenant-1'

interface State {
  profile: Row | null
  productRow: Row | null
  planRow: Row | null
  existingOpenRequest: Row | null
  /** What the SECOND `findOpenPaymentRequest` read (post-23505) returns, if different from the first. */
  winnerAfterRace: Row | null
  insertResult: Row | null
  insertError: Row | null
  insertCalls: Row[]
  selectCallCount: number
}

const state: State = {
  profile: null,
  productRow: null,
  planRow: null,
  existingOpenRequest: null,
  winnerAfterRace: null,
  insertResult: null,
  insertError: null,
  insertCalls: [],
  selectCallCount: 0,
}

function makeSupabase() {
  const client = makeClient(({ table, op, values }) => {
    switch (table) {
      case 'profiles':
        return { data: state.profile, error: null }
      case 'products':
        return { data: state.productRow, error: state.productRow ? null : { message: 'not found' } }
      case 'plans':
        return { data: state.planRow, error: state.planRow ? null : { message: 'not found' } }
      case 'payment_requests':
        if (op === 'select') {
          state.selectCallCount += 1
          // The action calls findOpenPaymentRequest twice on a lost 23505
          // race: once before the insert (finds nothing) and once after
          // (finds the row the concurrent request just won).
          if (state.selectCallCount > 1 && state.winnerAfterRace) {
            return { data: state.winnerAfterRace, error: null }
          }
          return { data: state.existingOpenRequest, error: null }
        }
        if (op === 'insert') {
          state.insertCalls.push(values!)
          if (state.insertError) return { data: null, error: state.insertError }
          return { data: state.insertResult, error: null }
        }
        return { data: null, error: null }
      default:
        return { data: null, error: null }
    }
  })
  return {
    ...client,
    auth: { getUser: () => Promise.resolve({ data: { user: { id: USER_ID, email: 'student@example.com' } }, error: null }) },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeSupabase()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeSupabase() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(TENANT_ID),
  getCurrentUserId: () => Promise.resolve(USER_ID),
}))
vi.mock('@/lib/analytics/server', () => ({
  track: vi.fn(() => Promise.resolve()),
  safeAnalytics: (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/payments/subscription-guard', async importActual => {
  const actual = await importActual<typeof import('@/lib/payments/subscription-guard')>()
  return { ...actual, findConflictingSubscription: () => Promise.resolve(null) }
})

import { createPaymentRequest } from '@/app/actions/payment-requests'
import { track } from '@/lib/analytics/server'

beforeEach(() => {
  vi.clearAllMocks()
  state.profile = { full_name: 'Student One' }
  state.productRow = { product_id: 10, name: 'Course', price: '49.00', currency: 'usd', payment_provider: 'manual' }
  state.planRow = null
  state.existingOpenRequest = null
  state.insertResult = { request_id: 500, status: 'pending' }
  state.insertError = null
  state.insertCalls = []
  state.selectCallCount = 0
})

describe('createPaymentRequest — dedupe (#754)', () => {
  it('returns the existing open request for the same user + tenant + product, without inserting or tracking', async () => {
    state.existingOpenRequest = { request_id: 42, status: 'contacted', product_id: 10 }

    const result = await createPaymentRequest({ productId: 10 })

    expect(result.error).toBeUndefined()
    expect(result.request).toEqual(state.existingOpenRequest)
    expect(state.insertCalls).toHaveLength(0)
    expect(track).not.toHaveBeenCalled()
  })

  it('inserts a new request when there is no open one', async () => {
    state.existingOpenRequest = null

    const result = await createPaymentRequest({ productId: 10 })

    expect(result.error).toBeUndefined()
    expect(result.request).toEqual(state.insertResult)
    expect(state.insertCalls).toHaveLength(1)
    expect(state.insertCalls[0]).toMatchObject({ user_id: USER_ID, tenant_id: TENANT_ID, product_id: 10, status: 'pending' })
    expect(track).toHaveBeenCalledTimes(1)
  })

  it('on a 23505 lost race, re-reads and returns the winner instead of erroring', async () => {
    state.existingOpenRequest = null
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' }
    // The concurrent request that won the race — what the SECOND
    // findOpenPaymentRequest read (post-23505) finds.
    state.winnerAfterRace = { request_id: 99, status: 'pending', product_id: 10 }

    const result = await createPaymentRequest({ productId: 10 })

    expect(result.error).toBeUndefined()
    expect(result.request).toEqual(state.winnerAfterRace)
    expect(state.insertCalls).toHaveLength(1)
    expect(state.selectCallCount).toBe(2)
  })

  it('on an insert error that is not 23505, returns the generic failure message', async () => {
    state.existingOpenRequest = null
    state.insertError = { code: '23503', message: 'foreign key violation' }

    const result = await createPaymentRequest({ productId: 10 })

    expect(result.request).toBeUndefined()
    expect(result.error).toBe('Failed to create payment request')
  })
})
