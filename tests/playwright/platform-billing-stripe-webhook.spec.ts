/**
 * A school pays the platform through Stripe — proven with a SIGNED synthetic
 * `checkout.session.completed` (#296 Phase 5, case 5).
 *
 * `stripe listen` needs a live CLI session and a restart to pick up its
 * secret; this signs the event with the `STRIPE_PLATFORM_WEBHOOK_SECRET`
 * already in the environment (`t=<ts>,v1=HMAC_SHA256(secret, "<ts>.<body>")`,
 * which is all `stripe.webhooks.constructEvent` checks) and POSTs it to the
 * real endpoint. Everything after the signature — the `webhook_events` claim,
 * the normalizer, `dispatchPlatformBillingEvent`, the tenant / subscription /
 * revenue-split writes and the cutoff reconcile — runs for real.
 *
 * The unit test for the route stubs the signature check; this is the only
 * test that exercises it.
 */
import { createHmac } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { BASE } from './utils/constants'
import {
  DAY_MS,
  createQaTenant,
  destroyQaTenant,
  getAdmin,
  tenantRow,
  usageOf,
  type QaTenant,
} from './utils/plan-gate-fixtures'

const QA: QaTenant = {
  id: '00000000-0000-0000-0000-000000000298',
  slug: 'qa-stripe-webhook',
  name: 'QA Stripe Webhook',
  planSlug: 'e2e-unused-stripe', // no throwaway plan needed; destroy() tolerates its absence
}

const WEBHOOK_SECRET = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET
const WEBHOOK_URL = `${BASE}/api/billing/webhook/stripe`

function sign(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
  return `t=${timestamp},v1=${v1}`
}

/** The event Stripe sends when a hosted Checkout in subscription mode completes. */
function checkoutCompleted(opts: { eventId: string; subscriptionId: string; planId: string }) {
  const created = Math.floor(Date.now() / 1000)
  return JSON.stringify({
    id: opts.eventId,
    object: 'event',
    api_version: '2025-01-27.acacia',
    created,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_test_${opts.eventId}`,
        object: 'checkout.session',
        mode: 'subscription',
        status: 'complete',
        payment_status: 'paid',
        subscription: opts.subscriptionId,
        customer: `cus_test_${QA.id.slice(-4)}`,
        // Written by app/api/billing/checkout/route.ts; echoed back by Stripe.
        metadata: {
          tenant_id: QA.id,
          plan_id: opts.planId,
          plan_slug: 'starter',
          interval: 'monthly',
        },
      },
    },
  })
}

test.describe.configure({ mode: 'serial' })

test.describe('platform billing — signed Stripe webhook (#296)', () => {
  test.skip(!WEBHOOK_SECRET, 'STRIPE_PLATFORM_WEBHOOK_SECRET is required')

  let starterPlanId: string
  const eventId = `evt_e2e_${Date.now()}`
  const subscriptionId = `sub_e2e_${Date.now()}`

  test.beforeAll(async () => {
    const admin = getAdmin()
    await destroyQaTenant(admin, QA)
    await createQaTenant(admin, QA, 'free')

    const { data: starter, error } = await admin.from('platform_plans').select('plan_id').eq('slug', 'starter').single()
    if (error) throw new Error(`starter plan missing: ${error.message}`)
    starterPlanId = starter.plan_id as string

    // A cutoff already on the row — the upgrade must lift it (0 courses on
    // Starter is not a violation), the same reconcile a manual confirm runs.
    await admin
      .from('tenants')
      .update({ access_cutoff_at: new Date(Date.now() + 7 * DAY_MS).toISOString() })
      .eq('id', QA.id)
  })

  test.afterAll(async () => {
    const admin = getAdmin()
    await admin.from('webhook_events').delete().eq('provider_event_id', eventId)
    await destroyQaTenant(admin, QA)
  })

  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'runs once — DB state is shared')
  })

  test('an unsigned body is refused', async ({ request }) => {
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json' },
      data: checkoutCompleted({ eventId: 'evt_e2e_unsigned', subscriptionId, planId: starterPlanId }),
    })
    expect(res.status()).toBe(400)
  })

  test('a body signed with the wrong secret is refused', async ({ request }) => {
    const payload = checkoutCompleted({ eventId: 'evt_e2e_tampered', subscriptionId, planId: starterPlanId })
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload, `${WEBHOOK_SECRET}x`) },
      data: payload,
    })
    expect(res.status()).toBe(400)
    expect((await tenantRow(getAdmin(), QA.id)).plan).toBe('free')
  })

  test('a signed checkout completion activates Starter and raises the caps', async ({ request }) => {
    const admin = getAdmin()
    const before = await usageOf(admin, QA.id)
    expect(before.max_courses).toBe(5)

    const payload = checkoutCompleted({ eventId, subscriptionId, planId: starterPlanId })
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload, WEBHOOK_SECRET!) },
      data: payload,
    })
    expect(res.status(), await res.text()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true })

    const tenant = await tenantRow(admin, QA.id)
    expect(tenant.plan).toBe('starter')
    expect(tenant.billing_status).toBe('active')
    expect(tenant.access_cutoff_at).toBeNull()

    const { data: sub } = await admin
      .from('platform_subscriptions')
      .select('plan_id, status, payment_provider, provider_subscription_id, interval')
      .eq('tenant_id', QA.id)
      .single()
    expect(sub).toMatchObject({
      plan_id: starterPlanId,
      status: 'active',
      payment_provider: 'stripe',
      provider_subscription_id: subscriptionId,
      interval: 'monthly',
    })

    const { data: split } = await admin
      .from('revenue_splits')
      .select('platform_percentage, school_percentage')
      .eq('tenant_id', QA.id)
      .single()
    expect(split).toEqual({ platform_percentage: 5, school_percentage: 95 })

    const after = await usageOf(admin, QA.id)
    expect(after.max_courses).toBe(15)
    expect(after.max_students).toBe(200)

    const { data: ledger } = await admin
      .from('webhook_events')
      .select('processed_at, error')
      .eq('provider_event_id', eventId)
    expect(ledger).toEqual([expect.objectContaining({ error: null })])
    expect(ledger![0].processed_at).not.toBeNull()
  })

  test('replaying the same event is acknowledged as a duplicate', async ({ request }) => {
    const payload = checkoutCompleted({ eventId, subscriptionId, planId: starterPlanId })
    const res = await request.post(WEBHOOK_URL, {
      headers: { 'content-type': 'application/json', 'stripe-signature': sign(payload, WEBHOOK_SECRET!) },
      data: payload,
    })
    expect(res.status()).toBe(200)
    expect(await res.json()).toMatchObject({ received: true, duplicate: true })

    const { data: ledger } = await getAdmin().from('webhook_events').select('id').eq('provider_event_id', eventId)
    expect(ledger).toHaveLength(1)
  })
})
