import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db } from './support/fake-supabase'
import {
  BinancePayProvider,
  buildPassThrough,
  toMerchantTradeNo,
} from '@/lib/payments/binance-provider'
import type { CreateCheckoutParams } from '@/lib/payments/types'

/**
 * Binance Pay and Solana as school → platform rails (issue #610).
 *
 * Two things had never been true for platform billing before this: a provider
 * that correlates through something other than our reference, and a
 * subscription whose period nobody but us extends. Everything below is one of
 * those two.
 */

// ---------------------------------------------------------------------------
// Binance Pay — correlation
// ---------------------------------------------------------------------------

describe('binance merchantTradeNo', () => {
  it('passes a student reference through untouched', () => {
    // The student loop's reference IS the transaction id the webhook is matched
    // on. Rewriting it would break every existing student payment.
    expect(toMerchantTradeNo('1042')).toBe('1042')
  })

  it('synthesizes an accepted id for a platform reference', () => {
    // `platform:<tenant>:<plan>` is 80-odd characters with colons in it, and
    // Binance takes at most 32 alphanumerics.
    const id = toMerchantTradeNo('platform:00000000-0000-0000-0000-000000000001:plan-pro')
    expect(id).toMatch(/^[A-Za-z0-9]{1,32}$/)
  })

  it('never repeats, so an abandoned checkout can be retried', () => {
    // Binance rejects a duplicate merchantTradeNo. A deterministic hash of the
    // reference would leave a school that closed the tab unable to pay at all.
    const ref = 'platform:tenant:plan'
    expect(toMerchantTradeNo(ref)).not.toBe(toMerchantTradeNo(ref))
  })
})

describe('binance passThroughInfo', () => {
  const params = (metadata: Record<string, string>, reference = 'platform:t:p'): CreateCheckoutParams => ({
    mode: 'subscription',
    providerPriceId: '',
    amount: 29,
    currency: 'usd',
    reference,
    metadata,
  })

  it('carries the platform loop\'s snake_case keys', () => {
    const bag = buildPassThrough(
      params({ tenant_id: 'tenant-1', plan_id: 'plan-pro', plan_slug: 'pro', interval: 'monthly' }),
      'abc123',
    )
    expect(bag).toMatchObject({
      tenant_id: 'tenant-1',
      plan_id: 'plan-pro',
      plan_slug: 'pro',
      interval: 'monthly',
    })
  })

  it('keeps our reference when merchantTradeNo had to be synthesized', () => {
    const bag = buildPassThrough(params({ tenant_id: 't' }), 'abc123')
    expect(bag.ref).toBe('platform:t:p')
  })

  it('omits the reference when it survived as the trade number', () => {
    const bag = buildPassThrough(params({ userId: 'u-1' }, '1042'), '1042')
    expect(bag.ref).toBeUndefined()
    expect(bag.userId).toBe('u-1')
  })

  it('stays inside Binance\'s 512-character limit', () => {
    const long = 'x'.repeat(400)
    const bag = buildPassThrough(
      params({ tenant_id: long, plan_id: long, plan_slug: long, interval: 'monthly' }),
      'abc',
    )
    expect(JSON.stringify(bag).length).toBeLessThanOrEqual(512)
    // Dropped from the end of the priority list, so the owner binding is what
    // survives — a bag that parses without a tenant is worse than a short one.
    expect(bag.tenant_id).toBe(long)
  })
})

describe('binance webhook → platform vocabulary', () => {
  const provider = new BinancePayProvider('key', 'secret')

  const payload = (passThrough: Record<string, string>) =>
    JSON.stringify({
      bizType: 'PAY',
      bizStatus: 'PAY_SUCCESS',
      bizIdStr: 'order_9001',
      data: JSON.stringify({
        merchantTradeNo: 'p0011223344',
        passThroughInfo: JSON.stringify(passThrough),
      }),
    })

  it('reads a platform plan purchase as an activation, not a product payment', async () => {
    const event = await provider.normalizeWebhookEvent(
      payload({ tenant_id: 'tenant-1', plan_id: 'plan-pro', plan_slug: 'pro', interval: 'yearly' }),
    )
    expect(event?.type).toBe('subscription.activated')
    // Binance has no subscription object; the order id stands in for one.
    expect(event?.providerSubscriptionId).toBe('order_9001')
  })

  it('hands the dispatcher the whole bag, so it can resolve a tenant', async () => {
    const event = await provider.normalizeWebhookEvent(
      payload({ tenant_id: 'tenant-1', plan_id: 'plan-pro', plan_slug: 'pro', interval: 'yearly' }),
    )
    expect(event?.metadata).toMatchObject({
      tenant_id: 'tenant-1',
      plan_id: 'plan-pro',
      plan_slug: 'pro',
      interval: 'yearly',
    })
  })

  it('gives the platform loop back its own reference, not the synthetic one', async () => {
    const event = await provider.normalizeWebhookEvent(
      payload({ tenant_id: 'tenant-1', plan_id: 'plan-pro', ref: 'platform:tenant-1:plan-pro' }),
    )
    expect(event?.reference).toBe('platform:tenant-1:plan-pro')
  })

  it('still reads a student product purchase as a payment', async () => {
    const event = await provider.normalizeWebhookEvent(
      payload({ userId: 'user-1', tenantId: 'tenant-1', productId: '77' }),
    )
    expect(event?.type).toBe('payment.succeeded')
    expect(event?.reference).toBe('p0011223344')
  })
})

// ---------------------------------------------------------------------------
// The period WE own
// ---------------------------------------------------------------------------

const TENANT = '00000000-0000-0000-0000-000000000001'
const PLAN_PRO = 'plan-pro'
const PLAN_BIZ = 'plan-business'
const DAY = 24 * 60 * 60 * 1000

let db: Db

vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoffSafely: () => Promise.resolve(),
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve() }))

import { dispatchPlatformBillingEvent, selfManagedPeriod } from '@/lib/billing/platform-webhook-dispatch'

function client() {
  return createFakeSupabase(db, {
    embeds: { platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' } },
    conflictKeys: {
      platform_subscriptions: 'tenant_id',
      revenue_splits: 'tenant_id',
      tenant_billing_customers: 'tenant_id',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).client as any
}

const sub = () => db.platform_subscriptions[0]

beforeEach(() => {
  db = {
    tenants: [{ id: TENANT, name: 'Test School', plan: 'free', billing_status: 'free' }],
    tenant_users: [],
    platform_plans: [
      { plan_id: PLAN_PRO, slug: 'pro', name: 'Pro', transaction_fee_percent: 2 },
      { plan_id: PLAN_BIZ, slug: 'business', name: 'Business', transaction_fee_percent: 0 },
    ],
    platform_subscriptions: [],
    tenant_billing_customers: [],
    revenue_splits: [],
  }
})

const activation = (over: Record<string, unknown> = {}) => ({
  type: 'subscription.activated' as const,
  providerEventId: 'evt-1',
  providerSubscriptionId: 'order_9001',
  metadata: {
    tenant_id: TENANT,
    plan_id: PLAN_PRO,
    plan_slug: 'pro',
    interval: 'monthly',
  },
  raw: {},
  ...over,
})

describe('selfManagedPeriod', () => {
  it('runs a month from now for a school with no live period', () => {
    const now = new Date('2026-03-10T00:00:00Z')
    const { start, end } = selfManagedPeriod(null, 'monthly', now)
    expect(start.toISOString()).toBe(now.toISOString())
    expect(end.toISOString()).toBe('2026-04-10T00:00:00.000Z')
  })

  it('extends from the end of a period still running, so paying early costs nothing', () => {
    const now = new Date('2026-03-10T00:00:00Z')
    const { end } = selfManagedPeriod('2026-03-25T00:00:00.000Z', 'monthly', now)
    expect(end.toISOString()).toBe('2026-04-25T00:00:00.000Z')
  })

  it('starts from now once the old period has lapsed', () => {
    const now = new Date('2026-03-10T00:00:00Z')
    const { end } = selfManagedPeriod('2026-01-01T00:00:00.000Z', 'monthly', now)
    expect(end.toISOString()).toBe('2026-04-10T00:00:00.000Z')
  })

  it('honours a yearly interval', () => {
    const { end } = selfManagedPeriod(null, 'yearly', new Date('2026-03-10T00:00:00Z'))
    expect(end.toISOString()).toBe('2027-03-10T00:00:00.000Z')
  })
})

describe('dispatchPlatformBillingEvent on a self-managed rail', () => {
  it('derives a period the provider never reported', async () => {
    // Without this the row activates with a NULL current_period_end: the expiry
    // cron filters it out, the billing page shows no next payment, and the
    // school keeps a paid plan forever on one month's money.
    await dispatchPlatformBillingEvent(activation(), { provider: 'binance', admin: client() })

    expect(sub().status).toBe('active')
    expect(sub().current_period_end).toBeTruthy()
    const end = new Date(sub().current_period_end as string).getTime()
    expect(end).toBeGreaterThan(Date.now() + 27 * DAY)
    expect(db.tenants[0].billing_period_end).toBe(sub().current_period_end)
    expect(db.tenants[0].plan).toBe('pro')
  })

  it('treats a repeat payment as a renewal that extends the same plan', async () => {
    const end = new Date(Date.now() + 10 * DAY).toISOString()
    db.platform_subscriptions.push({
      tenant_id: TENANT,
      plan_id: PLAN_PRO,
      status: 'active',
      payment_provider: 'binance',
      interval: 'monthly',
      current_period_end: end,
    })

    await dispatchPlatformBillingEvent(activation({ providerEventId: 'evt-2' }), {
      provider: 'binance',
      admin: client(),
    })

    const extended = new Date(sub().current_period_end as string).getTime()
    expect(extended).toBeGreaterThan(new Date(end).getTime() + 27 * DAY)
  })

  it('moves the school to the plan it just paid for', async () => {
    // A rail with no subscription object mints fresh metadata per order, so —
    // unlike a provider echoing months-old checkout metadata — it is telling
    // the truth about which plan this payment bought.
    db.platform_subscriptions.push({
      tenant_id: TENANT,
      plan_id: PLAN_PRO,
      status: 'active',
      payment_provider: 'binance',
      interval: 'monthly',
      current_period_end: new Date(Date.now() + 5 * DAY).toISOString(),
    })

    await dispatchPlatformBillingEvent(
      activation({ metadata: { tenant_id: TENANT, plan_id: PLAN_BIZ, plan_slug: 'business', interval: 'monthly' } }),
      { provider: 'binance', admin: client() },
    )

    expect(sub().plan_id).toBe(PLAN_BIZ)
    expect(db.tenants[0].plan).toBe('business')
    // The revenue split follows the plan, or the school keeps paying the old fee.
    expect(db.revenue_splits[0]).toMatchObject({ platform_percentage: 0, school_percentage: 100 })
  })

  it('still distrusts stale metadata from a provider that echoes it', async () => {
    // The #603 rule is unchanged for rails with a subscription object: reading
    // plan_id past the first activation would rewrite a portal plan change.
    db.platform_subscriptions.push({
      tenant_id: TENANT,
      plan_id: PLAN_BIZ,
      status: 'active',
      payment_provider: 'stripe',
      interval: 'monthly',
      current_period_end: new Date(Date.now() + 5 * DAY).toISOString(),
    })

    await dispatchPlatformBillingEvent(
      {
        ...activation(),
        type: 'subscription.renewed',
        periodEnd: new Date(Date.now() + 35 * DAY),
      },
      { provider: 'stripe', admin: client() },
    )

    expect(sub().plan_id).toBe(PLAN_BIZ)
  })

  it('un-cancels a subscription the school has just paid to keep', async () => {
    // #546 §1 for a rail that reports nothing about scheduled cancellation:
    // without this the school pays for a month and the cron's cancel phase
    // still drops it to free at the end of it.
    db.platform_subscriptions.push({
      tenant_id: TENANT,
      plan_id: PLAN_PRO,
      status: 'active',
      payment_provider: 'solana',
      interval: 'monthly',
      cancel_at_period_end: true,
      canceled_at: new Date().toISOString(),
      grace_period_end: new Date(Date.now() + 2 * DAY).toISOString(),
      current_period_end: new Date(Date.now() + 2 * DAY).toISOString(),
    })

    await dispatchPlatformBillingEvent(activation({ providerSubscriptionId: 'sig-1' }), {
      provider: 'solana',
      admin: client(),
    })

    expect(sub().cancel_at_period_end).toBe(false)
    expect(sub().canceled_at).toBeNull()
    expect(sub().grace_period_end).toBeNull()
  })

  it('does not invent a period for a rail that reports its own', async () => {
    const reported = new Date(Date.now() + 40 * DAY)
    await dispatchPlatformBillingEvent(
      { ...activation(), periodEnd: reported, periodStart: new Date() },
      { provider: 'stripe', admin: client() },
    )
    expect(sub().current_period_end).toBe(reported.toISOString())
  })
})
