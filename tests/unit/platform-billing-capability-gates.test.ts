import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Pins the capability gates on the school-facing billing actions (#604).
 *
 * These actions used to reach for the Stripe SDK directly and branch on
 * `payment_provider === 'stripe'`, so a school on any other rail either hit an
 * unhandled Stripe error (plan change) or had its cancellation recorded only in
 * our DB while the provider kept billing. They now branch on
 * `ProviderCapabilities`, and the REAL `PROVIDER_CAPABILITIES` table drives
 * these tests so the shipped flags are what is being asserted.
 *
 * The invariants under test:
 *  - proration is quoted only where `supportsProrationPreview`; elsewhere the
 *    preview is honest rather than absent-looking or invented;
 *  - a `selfManagedPeriod` rail makes NO provider call on cancel/reactivate —
 *    there is no subscription object out there to talk to;
 *  - a provider-backed rail is told FIRST, so a failure never leaves our DB
 *    claiming a cancellation the provider never scheduled;
 *  - `cancel_at_period_end` and `canceled_at` are always written together
 *    (#545), and cancelling never improves a status.
 */

interface SubRow {
  payment_provider: string
  provider_subscription_id: string | null
  provider_customer_id?: string | null
  status: string
  cancel_at_period_end?: boolean
  current_period_end?: string | null
}

const state: {
  sub: SubRow | null
  plan: { plan_id: string; slug: string; name: string; transaction_fee_percent: number } | null
  price: { provider_price_id: string } | null
  billingCustomers: { payment_provider: string; provider_customer_id: string }[]
  tenant: { plan: string; billing_status: string } | null
  updates: { table: string; values: Record<string, unknown> }[]
  providerCalls: string[]
  omitMethods: string[]
  updateSub: ReturnType<typeof vi.fn>
  cancelSub: ReturnType<typeof vi.fn>
  reactivateSub: ReturnType<typeof vi.fn>
  previewChange: ReturnType<typeof vi.fn>
} = {
  sub: null,
  plan: null,
  price: null,
  billingCustomers: [],
  tenant: null,
  updates: [],
  providerCalls: [],
  omitMethods: [],
  updateSub: vi.fn(),
  cancelSub: vi.fn(),
  reactivateSub: vi.fn(),
  previewChange: vi.fn(),
}

function makeClient() {
  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      in: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      update: (values: Record<string, unknown>) => {
        state.updates.push({ table, values })
        return b
      },
      upsert: (values: Record<string, unknown>) => {
        state.updates.push({ table: `${table}:upsert`, values })
        return b
      },
      single: () =>
        Promise.resolve(
          table === 'platform_subscriptions'
            ? { data: state.sub, error: state.sub ? null : { message: 'not found' } }
            : table === 'platform_plans'
              ? { data: state.plan, error: state.plan ? null : { message: 'not found' } }
              : table === 'tenant_users'
                ? { data: { role: 'admin' }, error: null }
                : table === 'tenants'
                  ? { data: state.tenant, error: null }
                  : { data: null, error: null },
        ),
      maybeSingle: () =>
        Promise.resolve(
          table === 'platform_plan_prices'
            ? { data: state.price, error: null }
            : table === 'platform_subscriptions'
              ? { data: state.sub, error: null }
              : { data: null, error: null },
        ),
      // Unawaited terminal (`select().eq()`) — the billing-customers read.
      then: (resolve: (v: unknown) => unknown) =>
        resolve(
          table === 'tenant_billing_customers'
            ? { data: state.billingCustomers, error: null }
            : { data: [], error: null },
        ),
    }
    return b
  }
  return { from: (t: string) => builder(t) }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeClient()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => Promise.resolve(makeClient()) }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentUserId: () => Promise.resolve('u1'),
  getCurrentTenantId: () => Promise.resolve('t1'),
}))
vi.mock('@/lib/billing/plan-limits', () => ({
  checkPlanLimits: () => Promise.resolve({ ok: true }),
  countTenantUsage: () => Promise.resolve({ courses: 0, students: 0 }),
  formatPlanLimitError: () => 'limits',
}))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoff: () => Promise.resolve() }))
// Fails loudly if any action still reaches for the SDK instead of the provider.
vi.mock('@/lib/stripe', () => ({
  getStripe: () => {
    throw new Error('getStripe() must not be called from the billing actions (#604)')
  },
}))
vi.mock('@/lib/payments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return {
    ...actual,
    getPaymentProvider: (slug: string) => {
      state.providerCalls.push(slug)
      const client: Record<string, unknown> = {
        updateSubscription: state.updateSub,
        cancelSubscription: state.cancelSub,
        reactivateSubscription: state.reactivateSub,
        previewSubscriptionChange: state.previewChange,
      }
      // Model a provider class that declares the capability but ships no
      // implementation — PayPal is exactly this today for `reactivateSubscription`.
      for (const name of state.omitMethods) delete client[name]
      return client
    },
  }
})

import {
  previewPlanChange,
  cancelSubscription,
  reactivateSubscription,
  changePlan,
} from '@/app/actions/admin/billing'

const PLAN = { plan_id: 'p2', slug: 'business', name: 'Business', transaction_fee_percent: 0 }

beforeEach(() => {
  state.sub = null
  state.plan = PLAN
  state.price = { provider_price_id: 'price_target' }
  state.billingCustomers = []
  state.tenant = { plan: 'pro', billing_status: 'active' }
  state.updates = []
  state.providerCalls = []
  state.omitMethods = []
  state.updateSub = vi.fn().mockResolvedValue({ id: 's', status: 'active', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false })
  state.cancelSub = vi.fn().mockResolvedValue(undefined)
  state.reactivateSub = vi.fn().mockResolvedValue(undefined)
  state.previewChange = vi.fn().mockResolvedValue({ prorationAmount: 12.5, total: 41.5, currency: 'USD' })
})

describe('previewPlanChange — proration is quoted only where the provider can', () => {
  it('returns the provider quote on Stripe, in major units', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }

    const res = await previewPlanChange('p2', 'monthly')

    expect(res.ok).toBe(true)
    expect(res.ok && res.proration).toMatchObject({ prorationAmount: 12.5, total: 41.5, currency: 'USD' })
    expect(state.previewChange).toHaveBeenCalledWith('sub_1', expect.objectContaining({ newProviderPriceId: 'price_target' }))
  })

  it('invents no amounts on a provider that cannot quote (Lemon Squeezy)', async () => {
    state.sub = { payment_provider: 'lemonsqueezy', provider_subscription_id: 'ls_1', status: 'active', current_period_end: '2026-09-01T00:00:00Z' }

    const res = await previewPlanChange('p2', 'monthly')

    expect(res.ok).toBe(true)
    // No quote was requested, and none was fabricated.
    expect(state.previewChange).not.toHaveBeenCalled()
    expect(res.ok && res.proration).toBeNull()
    // ...but the admin is told when the change takes effect, so the dialog can
    // say something true rather than "we couldn't load a price preview".
    expect(res.ok && 'noProration' in res && res.noProration).toMatchObject({
      effectiveAt: '2026-09-01T00:00:00Z',
    })
  })

  it('falls back to an unquoted preview when a quoting provider errors', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }
    state.previewChange = vi.fn().mockRejectedValue(new Error('stripe down'))

    const res = await previewPlanChange('p2', 'monthly')

    // Best-effort: the change may still proceed, but nothing is invented and
    // this is NOT reported as "this rail has no proration".
    expect(res.ok).toBe(true)
    expect(res.ok && res.proration).toBeNull()
    expect(res.ok && 'noProration' in res ? res.noProration : undefined).toBeUndefined()
  })

  it('refuses a rail with no in-place swap without naming Stripe', async () => {
    state.sub = { payment_provider: 'manual', provider_subscription_id: null, status: 'active' }

    await expect(previewPlanChange('p2', 'monthly')).rejects.toThrow(/not available for this payment method/i)
  })
})

describe('changePlan — drives the provider, never the SDK', () => {
  it('swaps via the provider and clears a pending cancellation (#546 §1)', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }

    await changePlan('p2', 'monthly')

    expect(state.providerCalls).toContain('stripe')
    expect(state.updateSub).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ newProviderPriceId: 'price_target', cancelAtPeriodEnd: false }),
    )
    const subUpdate = state.updates.find((u) => u.table === 'platform_subscriptions')
    expect(subUpdate?.values).toMatchObject({ plan_id: 'p2', cancel_at_period_end: false, canceled_at: null })
  })

  it('resolves the target price on the subscription’s own provider', async () => {
    state.sub = { payment_provider: 'lemonsqueezy', provider_subscription_id: 'ls_1', status: 'active' }

    await changePlan('p2', 'monthly')

    expect(state.providerCalls).toContain('lemonsqueezy')
    expect(state.updateSub).toHaveBeenCalled()
  })

  it('does not touch the DB when the provider swap fails (#461)', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }
    state.updateSub = vi.fn().mockRejectedValue(new Error('card declined'))

    await expect(changePlan('p2', 'monthly')).rejects.toThrow(/card declined/)
    expect(state.updates.filter((u) => u.table === 'platform_subscriptions')).toHaveLength(0)
  })
})

describe('cancelSubscription — provider call only where there is one to make', () => {
  it('tells a provider-backed rail first, then mirrors locally', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }

    await cancelSubscription()

    expect(state.cancelSub).toHaveBeenCalledWith('sub_1', false)
    const update = state.updates.find((u) => u.table === 'platform_subscriptions')
    // Both written together — cancel_at_period_end is the only signal (#545)
    // and canceled_at rides with it.
    expect(update?.values).toMatchObject({ cancel_at_period_end: true })
    expect(update?.values.canceled_at).toBeTruthy()
  })

  it('makes NO provider call on a self-managed rail, but still schedules the cancel', async () => {
    state.sub = { payment_provider: 'manual', provider_subscription_id: null, status: 'active' }

    await cancelSubscription()

    expect(state.cancelSub).not.toHaveBeenCalled()
    expect(state.providerCalls).toHaveLength(0)
    expect(state.updates.find((u) => u.table === 'platform_subscriptions')?.values).toMatchObject({
      cancel_at_period_end: true,
    })
  })

  it('makes no provider call for a one-time crypto rail either', async () => {
    state.sub = { payment_provider: 'binance', provider_subscription_id: 'binance_order_1', status: 'active' }

    await cancelSubscription()

    // Binance Pay one-time has no subscription object; "cancel" means do not
    // extend at period end, which is purely our own state.
    expect(state.cancelSub).not.toHaveBeenCalled()
    expect(state.updates.find((u) => u.table === 'platform_subscriptions')?.values).toMatchObject({
      cancel_at_period_end: true,
    })
  })

  it('never improves a non-active status', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'expired' }

    await expect(cancelSubscription()).rejects.toThrow(/No active subscription/i)
    expect(state.cancelSub).not.toHaveBeenCalled()
    expect(state.updates).toHaveLength(0)
  })

  it('leaves our DB untouched when the provider refuses the cancel', async () => {
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }
    state.cancelSub = vi.fn().mockRejectedValue(new Error('stripe error'))

    await expect(cancelSubscription()).rejects.toThrow(/stripe error/)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses to record a DB-only cancel when the rail implements no cancel', async () => {
    // The gate here is `selfManagedPeriod`, not a per-method capability, so a
    // provider that drives the period but ships no `cancelSubscription` must
    // fail loudly. Skipping the call and writing the mirror anyway is the exact
    // DB-only cancellation this issue removed — the school would read
    // "cancelling at period end" while the provider kept charging.
    state.sub = { payment_provider: 'stripe', provider_subscription_id: 'sub_1', status: 'active' }
    state.omitMethods = ['cancelSubscription']

    await expect(cancelSubscription()).rejects.toThrow(/implements no cancelSubscription/i)
    expect(state.updates).toHaveLength(0)
  })
})

describe('reactivateSubscription — clears both flags together', () => {
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

  it('clears the provider schedule first on a provider-backed rail', async () => {
    state.sub = {
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: future,
    }

    await reactivateSubscription()

    expect(state.reactivateSub).toHaveBeenCalledWith('sub_1')
    expect(state.updates.find((u) => u.table === 'platform_subscriptions')?.values).toMatchObject({
      cancel_at_period_end: false,
      canceled_at: null,
    })
  })

  it('is app-side only on a self-managed rail', async () => {
    state.sub = {
      payment_provider: 'manual',
      provider_subscription_id: null,
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: future,
    }

    await reactivateSubscription()

    expect(state.reactivateSub).not.toHaveBeenCalled()
    expect(state.updates.find((u) => u.table === 'platform_subscriptions')?.values).toMatchObject({
      cancel_at_period_end: false,
      canceled_at: null,
    })
  })

  it('refuses a DB-only reactivate when the rail implements no reactivate', async () => {
    // The worse direction of the same bug: the school is told its subscription
    // is safe while the provider is still set to stop billing, so the plan
    // lapses at period end anyway. PayPal is this provider today (it ships
    // `cancelSubscription` but not its inverse) — unreachable only because its
    // `supportsPlatformBillingCheckout` is still false.
    state.sub = {
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: future,
    }
    state.omitMethods = ['reactivateSubscription']

    await expect(reactivateSubscription()).rejects.toThrow(/implements no reactivateSubscription/i)
    expect(state.updates).toHaveLength(0)
  })

  it('refuses to revive a lapsed period', async () => {
    state.sub = {
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_1',
      status: 'active',
      cancel_at_period_end: true,
      current_period_end: new Date(Date.now() - 1000).toISOString(),
    }

    await expect(reactivateSubscription()).rejects.toThrow(/already ended/i)
    expect(state.reactivateSub).not.toHaveBeenCalled()
  })
})
