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
const stripeUpdates: { id: string; params: Record<string, unknown> }[] = []

function makeClient() {
  return createFakeSupabase(db, {
    embeds: {
      platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' },
      tenants: { table: 'tenants', localKey: 'tenant_id', foreignKey: 'id' },
    },
    conflictKeys: {
      platform_subscriptions: 'tenant_id',
      revenue_splits: 'tenant_id',
    },
  }).client
}

vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeClient()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient() }))
vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(TENANT),
  getCurrentUserId: () => Promise.resolve(USER),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/billing/access-cutoff', () => ({ reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }) }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: {
      update: (id: string, params: Record<string, unknown>) => {
        stripeUpdates.push({ id, params })
        return Promise.resolve({ id })
      },
      retrieve: () =>
        Promise.resolve({ id: 'sub_live', customer: 'cus_1', items: { data: [{ id: 'si_1' }] } }),
    },
  }),
}))

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
      payment_method: 'manual_transfer',
      status: 'active',
      interval: 'yearly',
      cancel_at_period_end: false,
      canceled_at: null,
      current_period_start: daysFromNow(-360),
      current_period_end: daysFromNow(5),
      grace_period_end: null,
      renewal_reminder_sent_at: null,
      stripe_subscription_id: null,
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
  stripeUpdates.length = 0
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
        stripe_price_id_monthly: 'price_pro_m',
        stripe_price_id_yearly: 'price_pro_y',
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
        stripe_price_id_monthly: 'price_biz_m',
        stripe_price_id_yearly: 'price_biz_y',
      },
    ],
    platform_subscriptions: [],
    platform_payment_requests: [],
    revenue_splits: [],
    courses: [],
  }
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
    expect(stripeUpdates).toEqual([])
  })

  it('clears the cancellation on Stripe first for a Stripe subscription', async () => {
    const sub = seedSub({
      payment_method: 'stripe',
      stripe_subscription_id: 'sub_live',
      cancel_at_period_end: true,
    })

    await reactivateSubscription()

    expect(stripeUpdates).toEqual([{ id: 'sub_live', params: { cancel_at_period_end: false } }])
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
  it('sends cancel_at_period_end: false to Stripe and mirrors it locally', async () => {
    const sub = seedSub({
      payment_method: 'stripe',
      stripe_subscription_id: 'sub_live',
      cancel_at_period_end: true,
      canceled_at: daysFromNow(-2),
      plan_override_at: daysFromNow(-20),
      plan_override_by: 'super-1',
    })

    await changePlan(PLAN_BUSINESS, 'yearly')

    expect(stripeUpdates).toHaveLength(1)
    expect(stripeUpdates[0].params).toMatchObject({ cancel_at_period_end: false })
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
