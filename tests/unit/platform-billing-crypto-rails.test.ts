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
  const fake = createFakeSupabase(db, {
    embeds: { platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' } },
    conflictKeys: {
      platform_subscriptions: 'tenant_id',
      revenue_splits: 'tenant_id',
      tenant_billing_customers: 'tenant_id',
    },
    // The only two columns on the table that are NOT NULL with no default. The
    // upsert has to satisfy them on every write, including the ones that are
    // logically updates — see the notNull docs in support/fake-supabase.ts.
    notNull: { platform_subscriptions: ['tenant_id', 'plan_id'] },
  })
  return {
    ...fake.client,
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name !== 'apply_self_managed_platform_period') {
        return Promise.resolve({ data: null, error: null })
      }
      const effectKey = `${args._provider}:${args._provider_event_id}:${args._tenant_id}`
      db.webhook_business_effects ||= []
      const existingEffect = db.webhook_business_effects.find((row) => row.key === effectKey)
      let stored = db.platform_subscriptions.find((row) => row.tenant_id === args._tenant_id)
      if (!existingEffect) {
        db.webhook_business_effects.push({ key: effectKey })
        const period = selfManagedPeriod(
          stored?.current_period_end as string | null | undefined,
          args._interval === 'yearly' ? 'yearly' : 'monthly',
          new Date(),
        )
        stored ||= { tenant_id: args._tenant_id }
        Object.assign(stored, {
          plan_id: args._plan_id,
          status: 'active',
          payment_provider: args._provider,
          interval: args._interval,
          provider_subscription_id: args._provider_subscription_id,
          current_period_start: period.start.toISOString(),
          current_period_end: period.end.toISOString(),
          cancel_at_period_end: false,
          canceled_at: null,
          grace_period_end: null,
          renewal_reminder_sent_at: null,
        })
        if (!db.platform_subscriptions.includes(stored)) db.platform_subscriptions.push(stored)
        const tenant = db.tenants.find((row) => row.id === args._tenant_id)
        if (tenant) Object.assign(tenant, {
          billing_status: 'active',
          plan: args._plan_slug ?? tenant.plan,
          billing_period_end: period.end.toISOString(),
        })
        const plan = db.platform_plans.find((row) => row.plan_id === args._plan_id)
        if (plan) {
          const split = db.revenue_splits.find((row) => row.tenant_id === args._tenant_id)
            ?? { tenant_id: args._tenant_id }
          Object.assign(split, {
            platform_percentage: plan.transaction_fee_percent,
            school_percentage: 100 - Number(plan.transaction_fee_percent),
          })
          if (!db.revenue_splits.includes(split)) db.revenue_splits.push(split)
        }
      }
      return Promise.resolve({
        data: [{
          applied: !existingEffect,
          period_start: stored?.current_period_start,
          period_end: stored?.current_period_end,
        }],
        error: null,
      })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
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
    platform_plan_prices: [],
    platform_subscriptions: [],
    tenant_billing_customers: [],
    revenue_splits: [],
    webhook_business_effects: [],
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
      provider_subscription_id: 'order_previous',
      interval: 'monthly',
      current_period_end: end,
    })

    await dispatchPlatformBillingEvent(activation({ providerEventId: 'evt-2' }), {
      provider: 'binance',
      admin: client(),
    })

    const extended = new Date(sub().current_period_end as string).getTime()
    expect(extended).toBeGreaterThan(new Date(end).getTime() + 27 * DAY)
    expect(sub().provider_subscription_id).toBe('order_9001')
  })

  it('does not extend the period twice when the same provider event is replayed', async () => {
    await dispatchPlatformBillingEvent(activation(), { provider: 'binance', admin: client() })
    const firstEnd = sub().current_period_end

    await dispatchPlatformBillingEvent(activation(), { provider: 'binance', admin: client() })

    expect(sub().current_period_end).toBe(firstEnd)
    expect(db.tenants[0].billing_period_end).toBe(firstEnd)
  })

  it('does not extend event A twice when replay order is A, B, A', async () => {
    await dispatchPlatformBillingEvent(activation({ providerEventId: 'evt-A' }), {
      provider: 'binance',
      admin: client(),
    })
    await dispatchPlatformBillingEvent(activation({ providerEventId: 'evt-B' }), {
      provider: 'binance',
      admin: client(),
    })
    const afterB = sub().current_period_end

    await dispatchPlatformBillingEvent(activation({ providerEventId: 'evt-A' }), {
      provider: 'binance',
      admin: client(),
    })

    expect(sub().current_period_end).toBe(afterB)
  })

  it('does not restore stale plan metadata when replay order is A, B, A', async () => {
    const pro = { tenant_id: TENANT, plan_id: PLAN_PRO, plan_slug: 'pro', interval: 'monthly' }
    const business = { tenant_id: TENANT, plan_id: PLAN_BIZ, plan_slug: 'business', interval: 'monthly' }

    await dispatchPlatformBillingEvent(activation({ providerEventId: 'plan-A', metadata: pro }), {
      provider: 'binance', admin: client(),
    })
    await dispatchPlatformBillingEvent(activation({ providerEventId: 'plan-B', metadata: business }), {
      provider: 'binance', admin: client(),
    })
    await dispatchPlatformBillingEvent(activation({ providerEventId: 'plan-A', metadata: pro }), {
      provider: 'binance', admin: client(),
    })

    expect(sub().plan_id).toBe(PLAN_BIZ)
    expect(db.tenants[0].plan).toBe('business')
    expect(db.revenue_splits[0]).toMatchObject({ platform_percentage: 0, school_percentage: 100 })
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
})

describe('dispatchPlatformBillingEvent on a webhook-driven rail (#605)', () => {
  // Distrusting stale metadata means `plan_id` is absent from the event on
  // every Stripe / Lemon Squeezy delivery after the first. The row still has to
  // carry one: the upsert is INSERT … ON CONFLICT DO UPDATE, and Postgres
  // NOT NULL-checks the proposed insert tuple before it resolves the conflict.
  // When these two facts were served by one variable, every subscription
  // update and every renewal threw.

  const existingStripeSub = (over: Record<string, unknown> = {}) => {
    db.platform_subscriptions.push({
      tenant_id: TENANT,
      plan_id: PLAN_PRO,
      status: 'active',
      payment_provider: 'stripe',
      interval: 'monthly',
      current_period_end: new Date(Date.now() + 5 * DAY).toISOString(),
      ...over,
    })
  }

  it('records the period the checkout event never carried', async () => {
    // checkout.session.completed has a subscription id and our metadata but no
    // period — only the subscription event that follows it reports one. If that
    // second event cannot land, current_period_end stays NULL for the life of
    // the subscription: no next-payment date, and nothing for billing-health to
    // read.
    existingStripeSub({ current_period_end: null })
    const periodEnd = new Date(Date.now() + 30 * DAY)

    await dispatchPlatformBillingEvent(
      { ...activation(), providerEventId: 'evt-period', periodStart: new Date(), periodEnd },
      { provider: 'stripe', admin: client() },
    )

    expect(sub().current_period_end).toBe(periodEnd.toISOString())
    expect(db.tenants[0].billing_period_end).toBe(periodEnd.toISOString())
    // Unchanged: the event was not allowed to move the plan.
    expect(sub().plan_id).toBe(PLAN_PRO)
  })

  it('advances the period on renewal instead of throwing', async () => {
    // The failure mode this replaces was not a wrong value, it was a 500 — so
    // the provider retried the same event until it disabled the endpoint.
    existingStripeSub()
    const renewedTo = new Date(Date.now() + 35 * DAY)

    await expect(
      dispatchPlatformBillingEvent(
        {
          ...activation(),
          type: 'subscription.renewed',
          providerEventId: 'evt-renew',
          periodEnd: renewedTo,
        },
        { provider: 'stripe', admin: client() },
      ),
    ).resolves.toBeUndefined()

    expect(sub().current_period_end).toBe(renewedTo.toISOString())
    expect(sub().status).toBe('active')
  })

  it('falls back to the plan the price belongs to when no row exists yet', async () => {
    // Delivery order is not guaranteed. A subscription event that overtakes its
    // own checkout event has no stored row and no plan in metadata, but it does
    // name a price, and that price belongs to exactly one plan.
    db.platform_plan_prices = [
      { plan_id: PLAN_BIZ, payment_provider: 'stripe', provider_price_id: 'price_biz_m' },
    ]

    await dispatchPlatformBillingEvent(
      {
        ...activation(),
        providerEventId: 'evt-oo',
        metadata: { tenant_id: TENANT },
        providerPriceId: 'price_biz_m',
        periodEnd: new Date(Date.now() + 30 * DAY),
      },
      { provider: 'stripe', admin: client() },
    )

    expect(sub().plan_id).toBe(PLAN_BIZ)
  })

  it('drops an event it can resolve no plan for rather than 500ing forever', async () => {
    // Nothing to write the row against, and a subscription row without a plan
    // cannot exist. Throwing would just have the provider redeliver an event
    // that can never be applied.
    db.platform_plan_prices = []

    await expect(
      dispatchPlatformBillingEvent(
        {
          ...activation(),
          providerEventId: 'evt-noplan',
          metadata: { tenant_id: TENANT },
          providerPriceId: 'price_unknown',
        },
        { provider: 'stripe', admin: client() },
      ),
    ).resolves.toBeUndefined()

    expect(db.platform_subscriptions).toHaveLength(0)
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
