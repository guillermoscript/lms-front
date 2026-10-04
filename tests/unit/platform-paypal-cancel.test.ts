import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db } from './support/fake-supabase'

/**
 * `subscription.canceled` cancel semantics on a rail whose cancel is FINAL at
 * the provider (#744). PayPal's `POST /cancel` stops billing immediately, so
 * downgrading on the webhook would take back days the school already paid
 * for — the dispatcher instead keeps the plan and lets the expiry cron end it
 * at `current_period_end` (`PLATFORM_APP_CANCELED_PROVIDERS`). Stripe schedules
 * its own end and must keep the old immediate-downgrade behaviour, or the
 * expiry cron and the webhook would race the same downgrade.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const DAY = 24 * 60 * 60 * 1000

vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoffSafely: () => Promise.resolve(),
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve() }))
vi.mock('@/lib/billing/downgrade-tenant', () => ({
  downgradeTenantToFreeIfCurrent: vi.fn(() => Promise.resolve(10)),
}))

import { dispatchPlatformBillingEvent, PUSH_RAIL_GRACE_DAYS } from '@/lib/billing/platform-webhook-dispatch'
import { downgradeTenantToFreeIfCurrent } from '@/lib/billing/downgrade-tenant'

let db: Db

function client() {
  const fake = createFakeSupabase(db, {
    conflictKeys: { platform_subscriptions: 'tenant_id' },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fake.client as any
}

const sub = () => db.platform_subscriptions[0]

beforeEach(() => {
  vi.mocked(downgradeTenantToFreeIfCurrent).mockClear()
  db = {
    platform_subscriptions: [
      {
        tenant_id: TENANT,
        plan_id: 'plan-pro',
        status: 'active',
        payment_provider: 'paypal',
        provider_subscription_id: 'I-1',
        current_period_end: new Date(Date.now() + 10 * DAY).toISOString(),
        cancel_at_period_end: false,
        canceled_at: null,
      },
    ],
  }
})

const cancelEvent = () => ({
  type: 'subscription.canceled' as const,
  providerSubscriptionId: 'I-1',
  metadata: { tenant_id: TENANT },
  raw: {},
})

describe('subscription.canceled on paypal (no supportsScheduledCancellation)', () => {
  it('keeps the plan, sets cancel_at_period_end + canceled_at, and never downgrades while the paid period remains', async () => {
    await dispatchPlatformBillingEvent(cancelEvent(), { provider: 'paypal', admin: client() })

    expect(sub()).toMatchObject({
      status: 'active',
      plan_id: 'plan-pro',
      cancel_at_period_end: true,
    })
    expect(sub().canceled_at).toBeTruthy()
    expect(downgradeTenantToFreeIfCurrent).not.toHaveBeenCalled()
  })

  it('downgrades once the paid period has already passed — nobody at the provider will end it', async () => {
    db.platform_subscriptions[0].current_period_end = new Date(Date.now() - DAY).toISOString()

    await dispatchPlatformBillingEvent(cancelEvent(), { provider: 'paypal', admin: client() })

    expect(downgradeTenantToFreeIfCurrent).toHaveBeenCalledWith(expect.anything(), TENANT, 'paypal', 'I-1')
  })
})

describe('subscription.canceled on stripe (supportsScheduledCancellation) keeps the old immediate behaviour', () => {
  it('downgrades right away even with a future period — Stripe already scheduled its own end', async () => {
    db.platform_subscriptions[0].payment_provider = 'stripe'

    await dispatchPlatformBillingEvent(cancelEvent(), { provider: 'stripe', admin: client() })

    expect(downgradeTenantToFreeIfCurrent).toHaveBeenCalledWith(expect.anything(), TENANT, 'stripe', 'I-1')
  })
})

// A SUSPENDED PayPal subscription never sends another event, so without a
// deadline the school kept its paid plan forever (#479).
describe('subscription.past_due on paypal opens a grace window', () => {
  it('sets grace_period_end ~PUSH_RAIL_GRACE_DAYS out on the transition', async () => {
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.past_due',
        providerSubscriptionId: 'I-1',
        providerEventId: 'WH-SUSP',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'paypal', admin: client() },
    )

    expect(sub().status).toBe('past_due')
    const graceMs = Date.parse(sub().grace_period_end as string) - Date.now()
    expect(graceMs).toBeGreaterThan((PUSH_RAIL_GRACE_DAYS - 1) * DAY)
    expect(graceMs).toBeLessThanOrEqual(PUSH_RAIL_GRACE_DAYS * DAY)
  })

  it('stripe past_due leaves grace to Stripe dunning', async () => {
    db.platform_subscriptions[0].payment_provider = 'stripe'
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.past_due',
        providerSubscriptionId: 'I-1',
        providerEventId: 'WH-PD',
        metadata: { tenant_id: TENANT },
        raw: {},
      },
      { provider: 'stripe', admin: client() },
    )
    expect(sub().status).toBe('past_due')
    expect(sub().grace_period_end ?? null).toBeNull()
  })
})

// Seen live: a school downgraded after cancelling Pro subscribed to Starter on
// PayPal. The row went active but kept Pro + the old cancel flag, and
// tenants.plan stayed free.
describe('returning school: fresh PayPal activation over a canceled row', () => {
  it('takes the new plan from metadata, clears the old cancel, and sets tenants.plan', async () => {
    db.platform_subscriptions[0] = {
      ...db.platform_subscriptions[0],
      plan_id: 'plan-pro',
      status: 'canceled',
      provider_subscription_id: 'I-OLD',
      cancel_at_period_end: true,
      canceled_at: new Date(Date.now() - DAY).toISOString(),
      current_period_end: new Date(Date.now() - DAY).toISOString(),
    }
    db.platform_plans = [
      { plan_id: 'plan-pro', slug: 'pro' },
      { plan_id: 'plan-starter', slug: 'starter' },
    ]
    db.tenants = [{ id: TENANT, plan: 'free', billing_status: 'free' }]
    const next = new Date(Date.now() + 30 * DAY)

    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerSubscriptionId: 'I-NEW',
        providerEventId: 'WH-RETURN',
        periodEnd: next,
        metadata: { tenant_id: TENANT, plan_id: 'plan-starter', interval: 'monthly' },
        raw: {},
      },
      { provider: 'paypal', admin: client() },
    )

    expect(sub()).toMatchObject({
      status: 'active',
      plan_id: 'plan-starter',
      provider_subscription_id: 'I-NEW',
      cancel_at_period_end: false,
      canceled_at: null,
    })
    expect(db.tenants[0]).toMatchObject({ plan: 'starter', billing_status: 'active' })
  })
})

describe('subscription.expired on paypal is never deferred', () => {
  it('downgrades immediately, even with a future period end', async () => {
    await dispatchPlatformBillingEvent(
      { type: 'subscription.expired', providerSubscriptionId: 'I-1', metadata: { tenant_id: TENANT }, raw: {} },
      { provider: 'paypal', admin: client() },
    )

    expect(downgradeTenantToFreeIfCurrent).toHaveBeenCalledWith(expect.anything(), TENANT, 'paypal', 'I-1')
  })
})
