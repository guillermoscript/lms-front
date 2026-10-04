import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db, type Row } from './support/fake-supabase'

/**
 * First coverage for the school→platform billing actions (issue #546 §1, §2).
 *
 * §1 Cancelling was irreversible AND paying again did not undo it. PostgREST's
 *    ON CONFLICT DO UPDATE only writes the columns you supply, so
 *    confirmManualPayment's upsert left a stale `cancel_at_period_end = true`
 *    on the row: the school paid for a full year and was dropped to free at the
 *    end of it, with no reminder and no grace (both cron phases filter on
 *    `cancel_at_period_end = false`). The billing UI imported no reactivate
 *    action at all, and re-checkout is blocked while the sub is still active.
 *
 * §2 Both duplicate-request guards used `.single()`. With two matching rows
 *    PostgREST returns `PGRST116 / data: null`, so the guard PASSED — and since
 *    the two guards had different filters, creating a renewal alongside a
 *    pending upgrade was the ordinary way to get there.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = 'user-admin-1'
const PLAN_PRO = 'plan-pro'
const PLAN_BUSINESS = 'plan-business'
const DAY = 24 * 60 * 60 * 1000
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY).toISOString()

let db: Db
/**
 * Provider calls the actions make. Since #604 these actions drive
 * `IPaymentProvider` rather than the Stripe SDK, so the seam we record moved
 * one level up — the invariants below (a self-managed rail makes no provider
 * call; a plan change clears a pending cancellation) are unchanged.
 */
const providerCalls: { method: string; id: string; params?: Record<string, unknown> }[] = []
const confirmationRpcCalls: Record<string, unknown>[] = []
let confirmationRpcError: string | null = null

function makeClient() {
  const fake = createFakeSupabase(db, {
    embeds: {
      platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' },
      tenants: { table: 'tenants', localKey: 'tenant_id', foreignKey: 'id' },
    },
    conflictKeys: {
      platform_subscriptions: 'tenant_id',
      revenue_splits: 'tenant_id',
    },
  })
  return {
    ...fake.client,
    rpc: (name: string, args: Record<string, unknown>) => {
      const promoteSwitch = () => {
        const row = db.platform_subscription_switches.find((s) => s.switch_id === args._switch_id)
        const sub = db.platform_subscriptions.find((s) => s.tenant_id === args._tenant_id)
        if (!row || !sub) return false
        const state = String(row.state ?? 'pending_activation')
        if (['cancellation_pending', 'cancellation_retry', 'cancellation_scheduled', 'completed'].includes(state)) {
          return true
        }
        if (!['pending_activation', 'abandoned'].includes(state)) return false
        Object.assign(sub, {
          plan_id: args._target_plan_id,
          payment_provider: args._target_payment_provider,
          provider_subscription_id: args._target_provider_subscription_id,
          status: args._target_status,
          interval: args._target_interval,
          current_period_start: args._target_period_start,
          current_period_end: args._target_period_end,
          cancel_at_period_end: false,
          canceled_at: null,
        })
        Object.assign(row, {
          state: 'cancellation_pending',
          target_provider_subscription_id: args._target_provider_subscription_id,
          cancel_attempts: row.cancel_attempts ?? 0,
        })
        return true
      }

      if (name === 'promote_platform_subscription_switch') {
        return Promise.resolve({ data: promoteSwitch(), error: null })
      }

      if (name !== 'confirm_platform_payment_request') {
        return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } })
      }

      confirmationRpcCalls.push(args)
      if (confirmationRpcError) {
        return Promise.resolve({ data: null, error: { message: confirmationRpcError } })
      }

      const request = db.platform_payment_requests.find((r) => r.request_id === args._request_id)
      if (!request) return Promise.resolve({ data: null, error: { message: 'Payment request not found' } })
      if (request.status === 'confirmed') {
        const stored = db.platform_subscriptions.find((s) => s.tenant_id === request.tenant_id)
        return Promise.resolve({
          data: [{
            applied: false,
            tenant_id: request.tenant_id,
            switch_id: request.switch_id ?? null,
            period_start: stored?.current_period_start ?? null,
            period_end: stored?.current_period_end ?? null,
            confirmed_by: request.confirmed_by,
            confirmed_at: request.confirmed_at,
          }],
          error: null,
        })
      }
      if (request.status === 'rejected') {
        return Promise.resolve({ data: null, error: { message: 'Rejected payments cannot be confirmed' } })
      }
      if (request.status === 'expired') {
        return Promise.resolve({ data: null, error: { message: 'Expired payments cannot be confirmed' } })
      }

      const plan = db.platform_plans.find((p) => p.plan_id === request.plan_id)
      const existing = db.platform_subscriptions.find((s) => s.tenant_id === request.tenant_id)
      const now = new Date()
      const storedEnd = existing?.current_period_end ? new Date(existing.current_period_end as string) : null
      const start = request.request_type === 'renewal' && storedEnd && storedEnd > now ? storedEnd : now
      const end = new Date(start)
      if (request.interval === 'yearly') end.setUTCFullYear(end.getUTCFullYear() + 1)
      else end.setUTCMonth(end.getUTCMonth() + 1)

      if (request.switch_id) {
        Object.assign(args, {
          _switch_id: request.switch_id,
          _tenant_id: request.tenant_id,
          _target_plan_id: request.plan_id,
          _target_payment_provider: request.payment_provider ?? 'manual',
          _target_provider_subscription_id: null,
          _target_status: 'active',
          _target_interval: request.interval,
          _target_period_start: start.toISOString(),
          _target_period_end: end.toISOString(),
        })
        if (!promoteSwitch()) {
          return Promise.resolve({ data: null, error: { message: 'Subscription switch no longer matches the payment request' } })
        }
      } else {
        const values = {
          tenant_id: request.tenant_id,
          plan_id: request.plan_id,
          status: 'active',
          payment_provider: request.payment_provider ?? 'manual',
          interval: request.interval,
          current_period_start: start.toISOString(),
          current_period_end: end.toISOString(),
          grace_period_end: null,
          renewal_reminder_sent_at: null,
          cancel_at_period_end: false,
          canceled_at: null,
          plan_override_by: null,
          plan_override_at: null,
        }
        if (existing) Object.assign(existing, values)
        else db.platform_subscriptions.push({ subscription_id: 'sub-confirmed', ...values })

        const tenant = db.tenants.find((t) => t.id === request.tenant_id)
        if (tenant) Object.assign(tenant, { plan: plan?.slug, billing_status: 'active', billing_period_end: end.toISOString() })
        const split = db.revenue_splits.find((s) => s.tenant_id === request.tenant_id)
        const splitValues = {
          tenant_id: request.tenant_id,
          platform_percentage: plan?.transaction_fee_percent,
          school_percentage: 100 - Number(plan?.transaction_fee_percent),
        }
        if (split) Object.assign(split, splitValues)
        else db.revenue_splits.push(splitValues)
      }

      const confirmedAt = now.toISOString()
      Object.assign(request, { status: 'confirmed', confirmed_by: args._confirmed_by, confirmed_at: confirmedAt })
      const subscription = db.platform_subscriptions.find((s) => s.tenant_id === request.tenant_id)
      return Promise.resolve({
        data: [{
          applied: true,
          tenant_id: request.tenant_id,
          switch_id: request.switch_id ?? null,
          period_start: subscription?.current_period_start,
          period_end: subscription?.current_period_end,
          confirmed_by: args._confirmed_by,
          confirmed_at: confirmedAt,
        }],
        error: null,
      })
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeClient()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(TENANT),
  getCurrentUserId: () => Promise.resolve(USER),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
  reconcileAccessCutoffSafely: () => Promise.resolve(),
}))
// Reaching for the SDK from these actions is the bug #604 fixed — fail loudly.
vi.mock('@/lib/stripe', () => ({
  getStripe: () => {
    throw new Error('getStripe() must not be called from the billing actions (#604)')
  },
}))
vi.mock('@/lib/payments', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return {
    ...actual,
    getPaymentProvider: () => ({
      updateSubscription: (id: string, params: Record<string, unknown>) => {
        providerCalls.push({ method: 'updateSubscription', id, params })
        return Promise.resolve({ id, status: 'active', currentPeriodEnd: new Date(), cancelAtPeriodEnd: false })
      },
      cancelSubscription: (id: string, immediate: boolean) => {
        providerCalls.push({ method: 'cancelSubscription', id, params: { immediate } })
        return Promise.resolve({ mode: 'immediate' as const })
      },
      reactivateSubscription: (id: string) => {
        providerCalls.push({ method: 'reactivateSubscription', id })
        return Promise.resolve()
      },
    }),
  }
})
vi.mock('@/lib/billing/platform-billing', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      cancelSubscription: (id: string, immediate: boolean) => {
        providerCalls.push({ method: 'cancelSourceSubscription', id, params: { immediate } })
        return Promise.resolve({ mode: 'immediate' as const })
      },
    }),
  }
})

import {
  confirmManualPayment,
  reactivateSubscription,
  requestManualRenewal,
  requestManualPlanUpgrade,
  changePlan,
} from '@/app/actions/admin/billing'

function seedSub(over: Row = {}) {
  db.platform_subscriptions = [
    {
      subscription_id: 'sub-row-1',
      tenant_id: TENANT,
      plan_id: PLAN_PRO,
      payment_provider: 'manual',
      status: 'active',
      interval: 'yearly',
      cancel_at_period_end: false,
      canceled_at: null,
      current_period_start: daysFromNow(-360),
      current_period_end: daysFromNow(5),
      grace_period_end: null,
      renewal_reminder_sent_at: null,
      provider_subscription_id: null,
      plan_override_by: null,
      plan_override_at: null,
      ...over,
    },
  ]
  return db.platform_subscriptions[0]
}

function seedRequest(over: Row = {}) {
  const row: Row = {
    request_id: `req-${db.platform_payment_requests.length + 1}`,
    tenant_id: TENANT,
    plan_id: PLAN_PRO,
    requested_by: USER,
    request_type: 'upgrade',
    status: 'pending',
    interval: 'yearly',
    amount: 290,
    currency: 'usd',
    created_at: daysFromNow(-2),
    expires_at: daysFromNow(12),
    ...over,
  }
  db.platform_payment_requests.push(row)
  return row
}

beforeEach(() => {
  providerCalls.length = 0
  confirmationRpcCalls.length = 0
  confirmationRpcError = null
  db = {
    tenants: [{ id: TENANT, name: 'Test School', plan: 'pro', billing_status: 'active' }],
    tenant_users: [{ tenant_id: TENANT, user_id: USER, role: 'admin', status: 'active' }],
    super_admins: [{ user_id: USER }],
    platform_plans: [
      {
        plan_id: PLAN_PRO,
        slug: 'pro',
        name: 'Pro',
        price_monthly: 29,
        price_yearly: 290,
        transaction_fee_percent: 2,
        sort_order: 3,
        is_active: true,
        limits: { max_courses: 100, max_students: 1000 },
      },
      {
        plan_id: PLAN_BUSINESS,
        slug: 'business',
        name: 'Business',
        price_monthly: 79,
        price_yearly: 790,
        transaction_fee_percent: 0,
        sort_order: 4,
        is_active: true,
        limits: { max_courses: -1, max_students: 5000 },
      },
    ],
    // Price ids moved out of platform_plans into platform_plan_prices (#601).
    platform_plan_prices: [
      { plan_id: PLAN_PRO, payment_provider: 'stripe', interval: 'monthly', provider_price_id: 'price_pro_m', is_active: true },
      { plan_id: PLAN_PRO, payment_provider: 'stripe', interval: 'yearly', provider_price_id: 'price_pro_y', is_active: true },
      { plan_id: PLAN_BUSINESS, payment_provider: 'stripe', interval: 'monthly', provider_price_id: 'price_biz_m', is_active: true },
      { plan_id: PLAN_BUSINESS, payment_provider: 'stripe', interval: 'yearly', provider_price_id: 'price_biz_y', is_active: true },
    ],
    tenant_billing_customers: [],
    platform_subscriptions: [],
    platform_payment_requests: [],
    platform_subscription_switches: [],
    revenue_splits: [],
    courses: [],
  }
})

describe('#621 — manual provider switches', () => {
  it('does not revive a payment request that was explicitly rejected', async () => {
    const request = seedRequest({ status: 'rejected' })
    await expect(confirmManualPayment(request.request_id as string)).rejects.toThrow(
      /Rejected payments cannot be confirmed/,
    )
  })

  it('links the pending manual request to a source snapshot without canceling source', async () => {
    const source = seedSub({
      payment_provider: 'stripe',
      provider_subscription_id: 'sub-stripe-live',
      plan_id: PLAN_PRO,
    })

    await requestManualPlanUpgrade(PLAN_BUSINESS, 'yearly')
    const request = db.platform_payment_requests[0]
    const ledger = db.platform_subscription_switches[0]

    expect(source).toMatchObject({ status: 'active', provider_subscription_id: 'sub-stripe-live' })
    expect(providerCalls).toHaveLength(0)
    expect(ledger).toMatchObject({
      source_payment_provider: 'stripe',
      source_provider_subscription_id: 'sub-stripe-live',
      target_payment_provider: 'manual',
      target_plan_id: PLAN_BUSINESS,
    })
    expect(request.switch_id).toBe(ledger.switch_id)
  })

  it('promotes confirmed manual payment before canceling the old provider', async () => {
    seedSub({ payment_provider: 'stripe', provider_subscription_id: 'sub-stripe-live' })
    await requestManualPlanUpgrade(PLAN_BUSINESS, 'yearly')
    const request = db.platform_payment_requests[0]
    request.request_id = 'req-switch-manual'

    await confirmManualPayment(request.request_id as string)

    expect(db.platform_subscriptions[0]).toMatchObject({
      status: 'active',
      payment_provider: 'manual',
      provider_subscription_id: null,
      plan_id: PLAN_BUSINESS,
    })
    expect(providerCalls).toEqual([
      { method: 'cancelSourceSubscription', id: 'sub-stripe-live', params: { immediate: true } },
    ])
    expect(db.platform_subscription_switches[0]).toMatchObject({
      state: 'completed',
      source_cancel_mode: 'immediate',
    })
  })

  it('replaying confirmed switch activation does not extend the period or cancel twice', async () => {
    seedSub({ payment_provider: 'stripe', provider_subscription_id: 'sub-stripe-live' })
    await requestManualPlanUpgrade(PLAN_BUSINESS, 'yearly')
    const request = db.platform_payment_requests[0]
    request.request_id = 'req-switch-replay'

    await confirmManualPayment(request.request_id as string)
    const periodEnd = db.platform_subscriptions[0].current_period_end
    await confirmManualPayment(request.request_id as string)

    expect(db.platform_subscriptions[0].current_period_end).toBe(periodEnd)
    expect(providerCalls).toEqual([
      { method: 'cancelSourceSubscription', id: 'sub-stripe-live', params: { immediate: true } },
    ])
  })

  it('keeps an expired manual request and its abandoned switch terminal', async () => {
    seedSub({ payment_provider: 'stripe', provider_subscription_id: 'sub-stripe-live' })
    await requestManualPlanUpgrade(PLAN_BUSINESS, 'yearly')
    const request = db.platform_payment_requests[0]
    request.request_id = 'req-switch-late'
    request.status = 'expired'
    db.platform_subscription_switches[0].state = 'abandoned'

    await expect(confirmManualPayment(request.request_id as string)).rejects.toThrow(
      /Expired payments cannot be confirmed/,
    )

    expect(request.status).toBe('expired')
    expect(db.platform_subscriptions[0]).toMatchObject({
      payment_provider: 'stripe',
      plan_id: PLAN_PRO,
      status: 'active',
    })
    expect(db.platform_subscription_switches[0].state).toBe('abandoned')
    expect(providerCalls).toHaveLength(0)
  })
})

describe('#623 — transactional manual confirmation seam', () => {
  it('delegates request and actor to the confirmation RPC exactly once', async () => {
    const request = seedRequest({ status: 'payment_received' })

    await expect(confirmManualPayment(request.request_id as string)).resolves.toMatchObject({
      success: true,
      applied: true,
    })

    expect(confirmationRpcCalls).toEqual([{
      _request_id: request.request_id,
      _confirmed_by: USER,
    }])
  })

  it('surfaces the transactional RPC error without applying local writes', async () => {
    const request = seedRequest({ status: 'payment_received' })
    confirmationRpcError = 'Injected subscription write failure'

    await expect(confirmManualPayment(request.request_id as string)).rejects.toThrow(
      /Injected subscription write failure/,
    )

    expect(request.status).toBe('payment_received')
    expect(db.platform_subscriptions).toHaveLength(0)
    expect(db.revenue_splits).toHaveLength(0)
  })

  it('returns idempotent success without extending an already confirmed request', async () => {
    const subscription = seedSub()
    const confirmedAt = daysFromNow(-1)
    const request = seedRequest({ status: 'confirmed', confirmed_by: USER, confirmed_at: confirmedAt })
    const periodEnd = subscription.current_period_end

    await expect(confirmManualPayment(request.request_id as string)).resolves.toMatchObject({
      success: true,
      applied: false,
    })

    expect(subscription.current_period_end).toBe(periodEnd)
    expect(request.confirmed_at).toBe(confirmedAt)
  })
})

describe('#546 §1 — confirming a payment un-cancels', () => {
  it('clears cancel_at_period_end and canceled_at on the renewed subscription', async () => {
    const sub = seedSub({ cancel_at_period_end: true, canceled_at: daysFromNow(-3) })
    const request = seedRequest({ request_type: 'renewal', status: 'payment_received' })

    await confirmManualPayment(request.request_id as string)

    // The bug: the upsert never named these two columns, so the stale `true`
    // survived and the cron's cancel phase dropped the school to free at the
    // end of the year it had just paid for.
    expect(sub.cancel_at_period_end).toBe(false)
    expect(sub.canceled_at).toBeNull()
    expect(sub.status).toBe('active')
    expect(new Date(sub.current_period_end as string).getTime()).toBeGreaterThan(Date.now())
    expect(request.status).toBe('confirmed')
  })

  it('clears a super-admin plan override, so portal changes sync again', async () => {
    const sub = seedSub({ plan_override_by: 'super-1', plan_override_at: daysFromNow(-10) })
    const request = seedRequest({ request_type: 'renewal' })

    await confirmManualPayment(request.request_id as string)

    expect(sub.plan_override_at).toBeNull()
    expect(sub.plan_override_by).toBeNull()
  })
})

describe('#546 §1 — reactivateSubscription', () => {
  it('removes a pending cancellation on a manual subscription', async () => {
    const sub = seedSub({ cancel_at_period_end: true, canceled_at: daysFromNow(-1) })

    await reactivateSubscription()

    expect(sub.cancel_at_period_end).toBe(false)
    expect(sub.canceled_at).toBeNull()
    expect(providerCalls).toEqual([])
  })

  it('clears the cancellation at the provider first for a provider-backed subscription', async () => {
    const sub = seedSub({
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_live',
      cancel_at_period_end: true,
    })

    await reactivateSubscription()

    expect(providerCalls).toEqual([{ method: 'reactivateSubscription', id: 'sub_live' }])
    expect(sub.cancel_at_period_end).toBe(false)
  })

  it('refuses when nothing is scheduled for cancellation', async () => {
    seedSub({ cancel_at_period_end: false })
    await expect(reactivateSubscription()).rejects.toThrow(/not scheduled for cancellation/)
  })

  it('refuses once the paid period has already ended', async () => {
    seedSub({ cancel_at_period_end: true, current_period_end: daysFromNow(-1) })
    await expect(reactivateSubscription()).rejects.toThrow(/already ended/)
  })
})

describe('#546 §1 — changePlan does not leave a cancellation behind', () => {
  it('clears a pending cancellation as part of the swap and mirrors it locally', async () => {
    const sub = seedSub({
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_live',
      cancel_at_period_end: true,
      canceled_at: daysFromNow(-2),
      plan_override_at: daysFromNow(-20),
      plan_override_by: 'super-1',
    })

    await changePlan(PLAN_BUSINESS, 'yearly')

    expect(providerCalls).toHaveLength(1)
    expect(providerCalls[0].method).toBe('updateSubscription')
    expect(providerCalls[0].params).toMatchObject({ cancelAtPeriodEnd: false })
    expect(sub.cancel_at_period_end).toBe(false)
    expect(sub.canceled_at).toBeNull()
    expect(sub.plan_override_at).toBeNull()
    expect(sub.plan_id).toBe(PLAN_BUSINESS)
  })
})

describe('#546 §2 — duplicate-request guards survive two open rows', () => {
  it('blocks a third request when two are already open', async () => {
    seedSub()
    seedRequest({ request_type: 'upgrade' })
    seedRequest({ request_type: 'renewal' })

    // `.single()` returned PGRST116 with `data: null` here, so BOTH guards
    // passed and the table grew unbounded per tenant.
    await expect(requestManualPlanUpgrade(PLAN_BUSINESS, 'yearly')).rejects.toThrow(/already have a pending/)
    await expect(requestManualRenewal()).rejects.toThrow(/already have a pending/)
    expect(db.platform_payment_requests).toHaveLength(2)
  })

  it('blocks a renewal while an upgrade request is open', async () => {
    seedSub()
    seedRequest({ request_type: 'upgrade' })

    await expect(requestManualRenewal()).rejects.toThrow(/already have a pending/)
  })

  it('ignores a lapsed request so a school is never locked out of paying', async () => {
    seedSub()
    seedRequest({ request_type: 'renewal', expires_at: daysFromNow(-1) })

    await requestManualRenewal()

    expect(db.platform_payment_requests).toHaveLength(2)
    const created = db.platform_payment_requests[1]
    const ttlDays = (new Date(created.expires_at as string).getTime() - Date.now()) / DAY
    expect(ttlDays).toBeGreaterThan(13.5)
    expect(ttlDays).toBeLessThan(14.5)
  })

  it('ignores confirmed and rejected requests', async () => {
    seedSub()
    seedRequest({ status: 'confirmed' })
    seedRequest({ status: 'rejected' })

    await requestManualRenewal()

    expect(db.platform_payment_requests).toHaveLength(3)
  })
})

describe('#546 §2 — the renewal window guard is not bypassed by a non-active status', () => {
  it('rejects a renewal request 200 days before the end of a canceled subscription', async () => {
    seedSub({ status: 'canceled', current_period_end: daysFromNow(200) })

    await expect(requestManualRenewal()).rejects.toThrow(/within 30 days/)
    expect(db.platform_payment_requests).toHaveLength(0)
  })

  it('still lets a school in grace pay', async () => {
    seedSub({ status: 'past_due', current_period_end: daysFromNow(-3) })

    await requestManualRenewal()

    expect(db.platform_payment_requests).toHaveLength(1)
    expect(db.platform_payment_requests[0].request_type).toBe('renewal')
  })
})
