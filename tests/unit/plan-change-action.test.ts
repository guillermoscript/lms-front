import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the changePlan() orchestration (#463). The action builds its Supabase +
 * provider deps from module imports, so we mock those but keep the REAL
 * PROVIDER_CAPABILITIES so branching is driven by the shipped table:
 *   - native swap (stripe/lemonsqueezy) → call provider.updateSubscription THEN
 *     the change_subscription_plan RPC; revert the provider swap if the RPC fails.
 *   - self-managed (manual/one-time crypto) → RPC only, no provider call.
 *   - native recurring w/o swap (solana_subs/paypal) → rejected, no side effects.
 */

interface PlanRow {
  plan_id: number
  plan_name?: string
  payment_provider: string | null
  provider_price_id: string | null
  tenant_id?: string
  deleted_at?: string | null
}
interface SubRow {
  subscription_id: number
  plan_id: number
  payment_provider: string | null
  provider_subscription_id: string | null
}

const state: {
  userId: string | null
  targetPlan: PlanRow | null
  current: SubRow | null
  currentPlan: { provider_price_id: string | null } | null
  rpcError: { message: string } | null
  rpcCalls: { name: string; args: unknown }[]
  updateSub: ReturnType<typeof vi.fn>
} = {
  userId: 'u1',
  targetPlan: null,
  current: null,
  currentPlan: null,
  rpcError: null,
  rpcCalls: [],
  updateSub: vi.fn(),
}

function makeSupabase() {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: () => b,
      in: () => b,
      order: () => b,
      limit: () => b,
      single: () =>
        Promise.resolve(
          table === 'plans'
            ? { data: state.targetPlan, error: state.targetPlan ? null : { message: 'not found' } }
            : { data: null, error: null },
        ),
      maybeSingle: () =>
        Promise.resolve(
          table === 'subscriptions'
            ? { data: state.current, error: null }
            : table === 'plans'
              ? { data: state.currentPlan, error: null }
              : { data: null, error: null },
        ),
    }
    return b
  }
  return {
    from: (t: string) => builder(t),
    rpc: (name: string, args: unknown) => {
      state.rpcCalls.push({ name, args })
      return Promise.resolve({ data: null, error: state.rpcError })
    },
    auth: { getUser: () => Promise.resolve({ data: { user: { id: state.userId } }, error: null }) },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Map()) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeSupabase()) }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentUserId: () => Promise.resolve(state.userId),
  getCurrentTenantId: () => Promise.resolve('t1'),
}))
vi.mock('@/lib/rate-limit', () => ({
  freeEnrollmentLimiter: { check: () => Promise.resolve() },
  getClientIp: () => '127.0.0.1',
}))
vi.mock('@/app/actions/join-school', () => ({ joinCurrentSchool: () => Promise.resolve({ success: true }) }))
vi.mock('@/lib/payments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return { ...actual, getPaymentProvider: () => ({ updateSubscription: state.updateSub }) }
})

import { changePlan } from '@/app/[locale]/(public)/checkout/actions'

beforeEach(() => {
  state.userId = 'u1'
  state.targetPlan = null
  state.current = null
  state.currentPlan = null
  state.rpcError = null
  state.rpcCalls = []
  state.updateSub = vi.fn().mockResolvedValue({ id: 'sub_x', status: 'active', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false })
})

describe('changePlan — native providers (Stripe / Lemon Squeezy)', () => {
  it('swaps the provider subscription then flips the DB via the RPC', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'stripe', provider_price_id: 'price_new', tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'stripe', provider_subscription_id: 'sub_x' }
    state.currentPlan = { provider_price_id: 'price_old' }

    const result = await changePlan('2')

    expect(state.updateSub).toHaveBeenCalledTimes(1)
    expect(state.updateSub).toHaveBeenCalledWith('sub_x', expect.objectContaining({
      newProviderPriceId: 'price_new',
      prorationBehavior: 'create_prorations',
    }))
    expect(state.rpcCalls).toEqual([{ name: 'change_subscription_plan', args: { _new_plan_id: 2 } }])
    expect(result).toEqual({ success: true })
  })

  it('reverts the provider swap when the RPC fails', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'stripe', provider_price_id: 'price_new', tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'stripe', provider_subscription_id: 'sub_x' }
    state.currentPlan = { provider_price_id: 'price_old' }
    state.rpcError = { message: 'some db failure' }

    await expect(changePlan('2')).rejects.toThrow()
    // First call swaps to the new price, second reverts to the old price.
    expect(state.updateSub).toHaveBeenCalledTimes(2)
    expect(state.updateSub.mock.calls[1][1]).toEqual(expect.objectContaining({
      newProviderPriceId: 'price_old',
      prorationBehavior: 'none',
    }))
  })
})

describe('changePlan — self-managed providers (manual)', () => {
  it('supersedes via the RPC only, with no provider call', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'manual', provider_price_id: null, tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'manual', provider_subscription_id: null }

    const result = await changePlan('2')

    expect(state.updateSub).not.toHaveBeenCalled()
    expect(state.rpcCalls).toEqual([{ name: 'change_subscription_plan', args: { _new_plan_id: 2 } }])
    expect(result).toEqual({ success: true })
  })
})

describe('changePlan — guards', () => {
  it('rejects native-recurring providers without an in-place swap (solana_subs)', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'solana_subs', provider_price_id: null, tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'solana_subs', provider_subscription_id: 'pda_x' }

    await expect(changePlan('2')).rejects.toThrow()
    expect(state.updateSub).not.toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects a switch to the same plan', async () => {
    state.targetPlan = { plan_id: 1, payment_provider: 'manual', provider_price_id: null, tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'manual', provider_subscription_id: null }

    await expect(changePlan('1')).rejects.toThrow(/already on this plan/)
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects a cross-provider switch', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'manual', provider_price_id: null, tenant_id: 't1', deleted_at: null }
    state.current = { subscription_id: 10, plan_id: 1, payment_provider: 'stripe', provider_subscription_id: 'sub_x' }

    await expect(changePlan('2')).rejects.toThrow(/different payment method/)
    expect(state.updateSub).not.toHaveBeenCalled()
    expect(state.rpcCalls).toHaveLength(0)
  })

  it('rejects when there is no active subscription', async () => {
    state.targetPlan = { plan_id: 2, payment_provider: 'manual', provider_price_id: null, tenant_id: 't1', deleted_at: null }
    state.current = null

    await expect(changePlan('2')).rejects.toThrow(/active subscription/)
    expect(state.rpcCalls).toHaveLength(0)
  })
})
