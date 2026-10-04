import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createFakeSupabase, type Db } from './support/fake-supabase'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { PLATFORM_WEBHOOK_PROVIDERS } from '@/lib/billing/platform-billing'

/**
 * The two money loops share a merchant account on every rail but Stripe — so
 * the school → platform dispatcher has to refuse the student loop's events.
 *
 * WHY THIS IS REACHABLE AND NOT THEORETICAL. `platformWebhookSecret()` gives
 * Stripe a second signing secret (`STRIPE_PLATFORM_WEBHOOK_SECRET`), so a
 * student event posted to `/api/billing/webhook/stripe` fails verification and
 * dies at the door. Every other rail bills both loops out of ONE merchant
 * account. Binance Pay and Lemon Squeezy sign both with the one secret their
 * factory branch reads. PayPal verifies the platform endpoint against its own
 * registration id (`PAYPAL_PLATFORM_WEBHOOK_ID`, #744), but that does NOT
 * separate the loops: PayPal delivers every event of the app to every
 * registered URL, each signed for the registration it went to. Register
 * `/api/billing/webhook/<provider>` for school billing and that endpoint also
 * receives every student's course purchase, correctly signed, and therefore
 * verified.
 *
 * WHAT THAT USED TO DO. `resolveTenantId` reads `metadata.tenant_id ??
 * metadata.tenantId`, and the student checkout puts exactly `tenantId` in
 * provider metadata (app/api/payments/checkout/route.ts) — so the event
 * resolved the buyer's SCHOOL. It then fell through to
 * `STATUS_BY_TYPE[event.type] ?? 'active'`, which has no entry for
 * `payment.succeeded`, and a $5 course sale rewrote the school's
 * `platform_subscriptions` row: `status: 'active'`, `payment_provider` flipped
 * to the student rail, `grace_period_end` and `renewal_reminder_sent_at`
 * cleared. On a school paying by bank transfer that is the platform's own
 * revenue: `expire-platform-subscriptions` only walks
 * `PLATFORM_SELF_MANAGED_PROVIDERS`, and `paypal` is not one, so after the flip
 * nothing would ever expire that row again.
 *
 * The identity guard below the resolve does not save it either — it is skipped
 * entirely when the stored row has no `provider_subscription_id`, which is
 * exactly the shape of a manual (bank transfer) subscription.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const OTHER_TENANT = '00000000-0000-0000-0000-000000000002'
const PLAN_PRO = 'plan-pro'
const DAY = 24 * 60 * 60 * 1000

vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoffSafely: () => Promise.resolve(),
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve() }))

import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'

let db: Db

function client() {
  const fake = createFakeSupabase(db, {
    embeds: { platform_plans: { table: 'platform_plans', localKey: 'plan_id', foreignKey: 'plan_id' } },
    conflictKeys: {
      platform_subscriptions: 'tenant_id',
      revenue_splits: 'tenant_id',
      tenant_billing_customers: 'tenant_id',
    },
    notNull: { platform_subscriptions: ['tenant_id', 'plan_id'] },
  })
  return {
    ...fake.client,
    rpc: () => Promise.resolve({ data: null, error: null }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any
}

const sub = () => db.platform_subscriptions[0]

beforeEach(() => {
  db = {
    tenants: [
      { id: TENANT, name: 'Bank Transfer School', plan: 'pro', billing_status: 'past_due' },
      { id: OTHER_TENANT, name: 'Other School', plan: 'free', billing_status: 'free' },
    ],
    tenant_users: [],
    platform_plans: [{ plan_id: PLAN_PRO, slug: 'pro', name: 'Pro', transaction_fee_percent: 2 }],
    platform_plan_prices: [],
    // A school that pays by bank transfer and has lapsed: the cron has opened
    // its grace window and sent its reminder, and the row carries NO
    // `provider_subscription_id` — there is no provider object to carry one.
    platform_subscriptions: [
      {
        tenant_id: TENANT,
        plan_id: PLAN_PRO,
        status: 'past_due',
        payment_provider: 'manual',
        provider_subscription_id: null,
        interval: 'monthly',
        current_period_start: new Date(Date.now() - 40 * DAY).toISOString(),
        current_period_end: new Date(Date.now() - 10 * DAY).toISOString(),
        grace_period_end: new Date(Date.now() + 4 * DAY).toISOString(),
        renewal_reminder_sent_at: new Date(Date.now() - 12 * DAY).toISOString(),
        cancel_at_period_end: false,
      },
    ],
    tenant_billing_customers: [],
    revenue_splits: [],
    webhook_business_effects: [],
  }
})

/**
 * A student's course purchase, exactly as the adapters normalise it: the
 * `tenantId` key comes from the student checkout's metadata, and PayPal packs
 * it into `custom_id` (`reference|userId|tenantId`) precisely so the STUDENT
 * dispatcher can bind the owner. Nothing about the shape marks it as belonging
 * to the other loop — which is the whole problem.
 */
const studentPurchase = (over: Record<string, unknown> = {}) => ({
  type: 'payment.succeeded' as const,
  providerEventId: 'WH-student-capture-1',
  providerPaymentId: 'CAP-1',
  reference: '4021', // a transactions.transaction_id, not a platform reference
  metadata: { userId: 'a1000000-0000-0000-0000-000000000001', tenantId: TENANT },
  raw: {},
  ...over,
})

function snapshot() {
  return JSON.parse(JSON.stringify(sub()))
}

describe('the platform dispatcher refuses the student loop’s events', () => {
  it.each(['paypal', 'binance', 'lemonsqueezy'] as PaymentProvider[])(
    'a %s course sale does not touch the school’s platform subscription',
    async (provider) => {
      const before = snapshot()
      await dispatchPlatformBillingEvent(studentPurchase(), { provider, admin: client() })

      // Every one of these was rewritten before the guard: `status` to active,
      // `payment_provider` to the student rail, and the two cron stamps to null
      // — which together hand a lapsed school its plan for free.
      expect(sub()).toEqual(before)
      expect(db.tenants[0].billing_status).toBe('past_due')
    },
  )

  it('a refund on a course sale does not touch it either', async () => {
    const before = snapshot()
    await dispatchPlatformBillingEvent(
      studentPurchase({ type: 'refund.succeeded', providerEventId: 'WH-student-refund-1' }),
      { provider: 'paypal', admin: client() },
    )
    expect(sub()).toEqual(before)
  })

  it('a failed card on a course sale does not put the school into dunning', async () => {
    // `payment.failed` is worse than the others: `STATUS_BY_TYPE` has no entry
    // for it either, so it would have written `active` — but the same event on
    // a healthy school reaching the `subscription.past_due` branch by any
    // future edit would mail that school a "your payment failed" notice for
    // someone else's declined card.
    const before = snapshot()
    await dispatchPlatformBillingEvent(
      studentPurchase({ type: 'payment.failed', providerEventId: 'WH-student-failed-1' }),
      { provider: 'binance', admin: client() },
    )
    expect(sub()).toEqual(before)
  })

  it('creates nothing for a school that has no platform subscription at all', async () => {
    // This one was already safe before the type guard, and the assertion is
    // here to say WHY: with no stored row and no plan in the student event's
    // metadata, `rowPlanId` resolves to nothing and the dispatcher drops the
    // event on "resolved no plan". That is a second, accidental line of
    // defence that only holds for a school with NO subscription — which is
    // exactly why the paying schools above were the ones getting corrupted.
    await dispatchPlatformBillingEvent(
      studentPurchase({ metadata: { tenantId: OTHER_TENANT } }),
      { provider: 'paypal', admin: client() },
    )
    expect(db.platform_subscriptions.find((row) => row.tenant_id === OTHER_TENANT)).toBeUndefined()
    expect(db.tenants[1].billing_status).toBe('free')
  })

  it.each(['paypal', 'lemonsqueezy', 'binance'] as PaymentProvider[])(
    'a student PLAN purchase on %s does not touch the school’s platform subscription either',
    async (provider) => {
      // The type guard above cannot see this one: a student's PLAN purchase on
      // PayPal/Lemon Squeezy normalises to `subscription.activated` — the very
      // type a platform activation uses — carrying the student checkout's
      // camelCase metadata instead of the platform checkout's `tenant_id` (#744).
      const before = snapshot()
      await dispatchPlatformBillingEvent(
        {
          type: 'subscription.activated',
          providerEventId: 'WH-student-plan-1',
          providerSubscriptionId: 'I-STUDENT-1',
          metadata: { userId: 'a1000000-0000-0000-0000-000000000001', tenantId: TENANT, planId: '42' },
          raw: {},
        },
        { provider, admin: client() },
      )
      expect(sub()).toEqual(before)
      expect(db.tenants[0].billing_status).toBe('past_due')
    },
  )

  it('still activates a real platform subscription on the same rail', async () => {
    // The guard is by event TYPE, not by provider — a genuine school → platform
    // activation on the very same PayPal account must still land, or the fix
    // would have turned a leak into an outage.
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: 'WH-platform-activation-1',
        providerSubscriptionId: 'I-PLATFORM-1',
        periodEnd: new Date(Date.now() + 30 * DAY),
        metadata: { tenant_id: TENANT, plan_id: PLAN_PRO, plan_slug: 'pro', interval: 'monthly' },
        raw: {},
      },
      { provider: 'paypal', admin: client() },
    )

    expect(sub()).toMatchObject({
      status: 'active',
      payment_provider: 'paypal',
      plan_id: PLAN_PRO,
      provider_subscription_id: 'I-PLATFORM-1',
      grace_period_end: null,
      renewal_reminder_sent_at: null,
    })
  })
})

describe('PayPal custom_id has no room for plan_slug — the dispatcher looks it up (#744)', () => {
  it('sets tenants.plan from the plan_id when a fresh activation carries no slug', async () => {
    await dispatchPlatformBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: 'WH-platform-fresh-1',
        providerSubscriptionId: 'I-PLATFORM-FRESH',
        periodEnd: new Date(Date.now() + 30 * DAY),
        // No plan_slug/planSlug — exactly what PayPal's packed custom_id yields.
        metadata: { tenant_id: OTHER_TENANT, plan_id: PLAN_PRO, interval: 'monthly' },
        raw: {},
      },
      { provider: 'paypal', admin: client() },
    )
    expect(db.tenants[1].plan).toBe('pro')
    expect(db.platform_subscriptions.find((row) => row.tenant_id === OTHER_TENANT)).toMatchObject({
      plan_id: PLAN_PRO,
      status: 'active',
    })
  })
})

describe('which rails the platform webhook endpoint is open for', () => {
  it('exposes an endpoint only for rails that can actually be paid on (#744 closes the PayPal gap)', () => {
    // PayPal used to be the one exception — an endpoint with no legitimate use,
    // since supportsPlatformBillingCheckout was false. #744 gave it a platform
    // checkout, so the list is now coherent with no carve-out: every rail
    // exposed here can actually be paid on.
    for (const slug of PLATFORM_WEBHOOK_PROVIDERS) {
      expect(PROVIDER_CAPABILITIES[slug].supportsPlatformBillingCheckout).toBe(true)
    }
  })
})
