import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the status guard on `rejectManualPayment` (issue #615).
 *
 * The action used to write `status: 'rejected'` by id with no read first, so a
 * request that had already been CONFIRMED could be flipped to rejected while
 * everything `confirmManualPayment` caused stood: the tenant kept the plan, the
 * platform subscription stayed active, and `revenue_splits` kept the paid plan's
 * fee. The row then claimed the school's payment was refused while the school
 * was still being served on it.
 *
 * Two things are pinned here, because the fix has two halves:
 *   1. the read-then-refuse, which produces the message a super admin sees, and
 *   2. the status filter ON THE WRITE, which is what actually holds when a
 *      confirm lands between the read and the update — the two-tab race that
 *      makes this reachable through the UI at all.
 *
 * And the column: the reason goes to `admin_notes`. `notes` belongs to the
 * school (`requestManualPlanUpgrade` puts the school's own note there), and
 * overwriting it destroyed the school's side of the record.
 */

const state: {
  row: { request_id: string; status: string; switch_id?: string | null } | null
  /** Rows the conditional UPDATE matched — [] means the status filter excluded it. */
  updateMatches: { request_id: string }[]
  updateError: { message: string } | null
  /** What the action actually sent, and what it filtered on. */
  lastUpdate: Record<string, unknown> | null
  lastNotFilter: { column: string; operator: string; value: unknown } | null
  lastSwitchUpdate: Record<string, unknown> | null
} = {
  row: null,
  updateMatches: [],
  updateError: null,
  lastUpdate: null,
  lastNotFilter: null,
  lastSwitchUpdate: null,
}

function makeFakeAdmin() {
  return {
    from(table: string) {
      if (table === 'platform_subscription_switches') {
        const switchBuilder: Record<string, unknown> = {
          update(values: Record<string, unknown>) {
            state.lastSwitchUpdate = values
            return switchBuilder
          },
          eq() { return switchBuilder },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({ data: [], error: null }).then(resolve)
          },
        }
        return switchBuilder
      }
      const b: Record<string, unknown> = {
        select() { return b },
        eq() { return b },
        maybeSingle() {
          return Promise.resolve({ data: state.row, error: null })
        },
        update(values: Record<string, unknown>) {
          state.lastUpdate = values
          // The write only lands on rows the status filter admits.
          return {
            eq() { return this },
            not(column: string, operator: string, value: unknown) {
              state.lastNotFilter = { column, operator, value }
              return this
            },
            select() {
              return Promise.resolve({
                data: state.updateError ? null : state.updateMatches,
                error: state.updateError,
              })
            },
          }
        },
      }
      return b
    },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentUserId: () => Promise.resolve('super-1') }))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: () => Promise.resolve(true) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeFakeAdmin() }))

import { rejectManualPayment } from '@/app/actions/platform/plans'

const REQUEST_ID = 'req-1'

/** A row in `status` that the conditional write would also admit. */
function open(status: string) {
  state.row = { request_id: REQUEST_ID, status }
  state.updateMatches = [{ request_id: REQUEST_ID }]
}

/** A row in `status` that both the read-check and the write filter reject. */
function terminal(status: string) {
  state.row = { request_id: REQUEST_ID, status }
  state.updateMatches = []
}

beforeEach(() => {
  state.row = null
  state.updateMatches = []
  state.updateError = null
  state.lastUpdate = null
  state.lastNotFilter = null
  state.lastSwitchUpdate = null
})

describe('rejectManualPayment — terminal statuses are refused', () => {
  it('a CONFIRMED request cannot be rejected, and nothing is written', async () => {
    terminal('confirmed')
    await expect(rejectManualPayment(REQUEST_ID, 'chargeback')).rejects.toThrow(
      /already confirmed/i
    )
    expect(state.lastUpdate).toBeNull()
  })

  it('an already-rejected request is refused', async () => {
    terminal('rejected')
    await expect(rejectManualPayment(REQUEST_ID, 'again')).rejects.toThrow(/already rejected/i)
    expect(state.lastUpdate).toBeNull()
  })

  it('an expired request is refused', async () => {
    terminal('expired')
    await expect(rejectManualPayment(REQUEST_ID, 'stale')).rejects.toThrow(/already expired/i)
    expect(state.lastUpdate).toBeNull()
  })

  it('a request that does not exist is refused', async () => {
    state.row = null
    await expect(rejectManualPayment('nope', 'reason')).rejects.toThrow('Request not found')
    expect(state.lastUpdate).toBeNull()
  })
})

describe('rejectManualPayment — open statuses still reject', () => {
  it.each(['pending', 'instructions_sent', 'payment_received'])('%s can be rejected', async (status) => {
    open(status)
    await expect(rejectManualPayment(REQUEST_ID, 'No transfer received')).resolves.toEqual({
      success: true,
    })
    expect(state.lastUpdate?.status).toBe('rejected')
  })

  it('fails the linked pending switch so the school can submit again', async () => {
    state.row = { request_id: REQUEST_ID, status: 'pending', switch_id: 'switch-1' }
    state.updateMatches = [{ request_id: REQUEST_ID }]

    await rejectManualPayment(REQUEST_ID, 'No transfer received')

    expect(state.lastSwitchUpdate).toMatchObject({
      state: 'failed',
      last_error: 'Manual payment request rejected: No transfer received',
    })
  })
})

describe('rejectManualPayment — where the reason is stored', () => {
  it('writes the reason to admin_notes and never touches the school note', async () => {
    open('pending')
    await rejectManualPayment(REQUEST_ID, 'No transfer received')

    expect(state.lastUpdate?.admin_notes).toBe('No transfer received')
    // `notes` carries the school's own note. Absent from the payload means it
    // survives the rejection — the whole point of the new column.
    expect(state.lastUpdate).not.toHaveProperty('notes')
  })
})

describe('rejectManualPayment — the guard survives a race', () => {
  it('the write itself filters out terminal statuses', async () => {
    open('pending')
    await rejectManualPayment(REQUEST_ID, 'reason')

    expect(state.lastNotFilter?.column).toBe('status')
    expect(state.lastNotFilter?.operator).toBe('in')
    // Every terminal status has to be in the filter, or the race stays open.
    for (const status of ['confirmed', 'rejected', 'expired']) {
      expect(String(state.lastNotFilter?.value)).toContain(status)
    }
  })

  it('a confirm landing between the read and the write is not overwritten', async () => {
    // The read saw `pending`; by the time the UPDATE ran, a concurrent confirm
    // had moved the row, so the conditional write matched nothing.
    state.row = { request_id: REQUEST_ID, status: 'pending' }
    state.updateMatches = []

    await expect(rejectManualPayment(REQUEST_ID, 'reason')).rejects.toThrow(/decided by someone else/i)
  })
})
