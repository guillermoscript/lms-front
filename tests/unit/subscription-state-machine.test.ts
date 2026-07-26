import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the subscription STATE MACHINE around cancel / reactivate / parallel
 * guards (issue #545, EPIC #540 §2.2). Three rules, each of which shipped
 * broken:
 *
 *   1. Cancelling never IMPROVES a status. Both cancel actions wrote
 *      `subscription_status: 'active'` unconditionally alongside the cancel
 *      fields, so a student mid-dunning who cancelled had their `past_due` row
 *      rewritten as healthy and the delinquency vanished from billing health
 *      and the admin views.
 *   2. Reactivating clears `cancel_at` WITH the flag. It used to push the date
 *      forward instead (the column was NOT NULL), leaving a live-looking cancel
 *      date behind; the CHECK added in 20260726120000 now rejects that.
 *   3. `renewed` blocks a parallel checkout. It grants access and still bills,
 *      but neither #459 guard listed it, so a `renewed` subscriber could buy a
 *      second plan and be billed twice.
 *
 * The actions build their Supabase client from module imports, so those are
 * mocked; the assertions are on the exact patch each action writes.
 */

interface SubRow {
  subscription_id: number
  user_id: string
  tenant_id: string
  plan_id: number
  subscription_status: string
  cancel_at_period_end: boolean | null
  current_period_end: string | null
  end_date: string
  payment_provider: string
  provider_subscription_id: string | null
}

const TENANT = 't1'
const USER = 'u1'

const state: {
  subscription: SubRow | null
  updates: { table: string; values: Record<string, unknown> }[]
} = { subscription: null, updates: [] }

function subRow(overrides: Partial<SubRow> = {}): SubRow {
  return {
    subscription_id: 10,
    user_id: USER,
    tenant_id: TENANT,
    plan_id: 1,
    subscription_status: 'active',
    cancel_at_period_end: false,
    current_period_end: '2026-09-01T00:00:00.000Z',
    end_date: '2026-09-01T00:00:00.000Z',
    payment_provider: 'manual',
    provider_subscription_id: null,
    ...overrides,
  }
}

function makeAdminClient() {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      insert: () => b,
      update: (values: Record<string, unknown>) => {
        state.updates.push({ table, values })
        return b
      },
      single: () =>
        Promise.resolve(
          table === 'subscriptions'
            ? { data: state.subscription, error: state.subscription ? null : { message: 'not found' } }
            : { data: null, error: null },
        ),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      // Awaitable terminal so `await admin.from(x).update(y).eq().eq()` resolves.
      then: (resolve: (v: { data: null; error: null }) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return b
  }
  return { from: (t: string) => builder(t) }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeAdminClient(),
  verifyAdminAccess: () => Promise.resolve(true),
}))
vi.mock('@/lib/supabase/get-user-role', () => ({ isSuperAdmin: () => Promise.resolve(false) }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentUserId: () => Promise.resolve(USER),
  getCurrentTenantId: () => Promise.resolve(TENANT),
}))
vi.mock('@/lib/payments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return { ...actual, getPaymentProvider: () => ({}) }
})

import { cancelMySubscription, reactivateMySubscription } from '@/app/actions/subscriptions'
import { cancelSubscription as adminCancelSubscription } from '@/app/actions/admin/subscriptions'
import {
  BLOCKING_SUBSCRIPTION_STATUSES,
  findConflictingSubscription,
} from '@/lib/payments/subscription-guard'

/** The one `subscriptions` patch the action under test wrote. */
function soleSubscriptionPatch() {
  const subs = state.updates.filter((u) => u.table === 'subscriptions')
  expect(subs).toHaveLength(1)
  return subs[0].values
}

beforeEach(() => {
  state.subscription = null
  state.updates = []
})

describe('cancelMySubscription — cancelling never improves a status', () => {
  it('leaves a past_due subscription past_due', async () => {
    state.subscription = subRow({ subscription_status: 'past_due' })

    const result = await cancelMySubscription(10)

    expect(result).toEqual({ success: true, providerWarning: undefined })
    const patch = soleSubscriptionPatch()
    expect(patch.subscription_status).toBe('past_due')
    expect(patch.cancel_at_period_end).toBe(true)
    expect(patch.cancel_at).toBe('2026-09-01T00:00:00.000Z')
  })

  it('keeps an active subscription active', async () => {
    state.subscription = subRow({ subscription_status: 'active' })
    await cancelMySubscription(10)
    expect(soleSubscriptionPatch().subscription_status).toBe('active')
  })

  it("normalizes the legacy 'renewed' status to active", async () => {
    // `renewed` means exactly what `active` means and nothing writes it any
    // more — this is the one status the cancel is allowed to rewrite.
    state.subscription = subRow({ subscription_status: 'renewed' })
    await cancelMySubscription(10)
    expect(soleSubscriptionPatch().subscription_status).toBe('active')
  })

  it('refuses to cancel a subscription that is not live', async () => {
    state.subscription = subRow({ subscription_status: 'expired' })
    await expect(cancelMySubscription(10)).resolves.toEqual({
      success: false,
      error: 'not_cancelable',
    })
    expect(state.updates.filter((u) => u.table === 'subscriptions')).toHaveLength(0)
  })
})

describe('reactivateMySubscription — the cancel date dies with the schedule', () => {
  it('clears cancel_at together with cancel_at_period_end', async () => {
    state.subscription = subRow({ cancel_at_period_end: true })

    await reactivateMySubscription(10)

    const patch = soleSubscriptionPatch()
    expect(patch).toEqual({
      cancel_at_period_end: false,
      cancel_at: null,
      canceled_at: null,
    })
  })
})

describe('admin cancelSubscription — same rule, admin surface', () => {
  it('a period-end cancel leaves a past_due subscription past_due', async () => {
    state.subscription = subRow({ subscription_status: 'past_due' })

    await adminCancelSubscription(10, false)

    const patch = soleSubscriptionPatch()
    expect(patch.subscription_status).toBe('past_due')
    expect(patch.cancel_at_period_end).toBe(true)
  })

  it('an immediate cancel is still a cancel', async () => {
    state.subscription = subRow({ subscription_status: 'past_due' })

    await adminCancelSubscription(10, true)

    const patch = soleSubscriptionPatch()
    expect(patch.subscription_status).toBe('canceled')
    expect(patch.cancel_at_period_end).toBeUndefined()
  })
})

describe('parallel-subscription guard — renewed is live', () => {
  it("lists 'renewed' as blocking", () => {
    expect(BLOCKING_SUBSCRIPTION_STATUSES).toEqual(
      expect.arrayContaining(['active', 'renewed', 'past_due']),
    )
  })

  it('blocks a second plan checkout while a renewed subscription is held', async () => {
    const queried: { statuses?: string[] } = {}
    const supabase = {
      from: () => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          in: (_col: string, values: string[]) => {
            queried.statuses = values
            // The DB only returns rows whose status is in the filter, so a
            // `renewed` row is visible here only because the guard asks for it.
            return Promise.resolve({
              data: values.includes('renewed')
                ? [
                    {
                      subscription_id: 7,
                      plan_id: 1,
                      end_date: '2026-09-01',
                      payment_provider: 'stripe',
                      plan: { plan_name: 'Pro' },
                    },
                  ]
                : [],
              error: null,
            })
          },
        }
        return b
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any

    const conflict = await findConflictingSubscription(supabase, {
      userId: USER,
      tenantId: TENANT,
      planId: 2, // a DIFFERENT plan — this is the parallel checkout
    })

    expect(queried.statuses).toContain('renewed')
    expect(conflict).toMatchObject({ subscription_id: 7, plan_id: 1, plan_name: 'Pro' })
  })
})
