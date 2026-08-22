import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Drives `POST /api/billing/webhook/[provider]` end-to-end — the unified
 * platform-billing webhook that replaced `/api/stripe/platform-webhook` (#603).
 *
 * Two things are deliberately NOT faked, because they are the parts that
 * regressed before: the Stripe adapter's own `normalizeWebhookEvent` runs for
 * real (so a payload-shape change fails here, the way #544's did in
 * production), and the platform dispatcher runs for real against a recording
 * Supabase fake. Only the signature check, the mailer and the two downstream
 * helpers with their own suites are stubbed.
 *
 * Every fixture is shaped the way API version 2026-02-25.clover delivers it —
 * periods on `subscription.items.data[0]`, never on the Subscription; the
 * invoice's subscription under `parent.subscription_details.subscription`.
 */

interface Write {
  table: string
  op: 'insert' | 'update' | 'upsert'
  values: Record<string, unknown>
}

const state: {
  existingEvent: { id: string; processed_at: string | null } | null
  claimStatus: 'claimed' | 'processing' | 'completed' | null
  storedSub: Record<string, unknown> | null
  planPriceRow: { plan_id: string } | null
  plan: { transaction_fee_percent: number } | null
  adminUsers: string[]
  failOn: ((w: Write) => { message: string } | null) | null
  writes: Write[]
  emails: { to: string; subject: string }[]
  businessEffects: Set<string>
} = {
  existingEvent: null,
  claimStatus: null,
  storedSub: null,
  planPriceRow: null,
  plan: null,
  adminUsers: [],
  failOn: null,
  writes: [],
  emails: [],
  businessEffects: new Set(),
}

function readRow(table: string, cols: string): unknown {
  if (table === 'webhook_events') return state.existingEvent
  if (table === 'platform_plans') return state.plan
  // Only read when an event names a price but resolves no plan any other way.
  if (table === 'platform_plan_prices') return state.planPriceRow
  if (table === 'platform_subscriptions') {
    // The dunning email joins the plan name off the same table.
    if (cols.includes('platform_plans')) return { platform_plans: { name: 'Pro' } }
    return state.storedSub
  }
  if (table === 'tenants') return { name: 'Test School' }
  if (table === 'tenant_users') return state.adminUsers.map((user_id) => ({ user_id }))
  return null
}

function makeAdmin() {
  function builder(table: string) {
    let cols = ''
    let pending: Write | null = null

    function settle() {
      if (pending) {
        const err = state.failOn?.(pending) ?? null
        if (err) return { data: null, error: err }
        // The past_due write is transition-guarded (`.neq('status','past_due')
        // .select()`): it returns the flipped row only when the stored status
        // was not already past_due, the way Postgres re-evaluates the WHERE
        // under the row lock.
        if (
          pending.table === 'platform_subscriptions' &&
          pending.op === 'update' &&
          pending.values.status === 'past_due'
        ) {
          const flipped = state.storedSub && state.storedSub.status !== 'past_due'
          return { data: flipped ? [{ tenant_id: state.storedSub!.tenant_id }] : [], error: null }
        }
        return { data: null, error: null }
      }
      return { data: readRow(table, cols), error: null }
    }

    const b: Record<string, unknown> = {
      select(c: string) {
        cols = c
        return b
      },
      insert(values: Record<string, unknown>) {
        pending = { table, op: 'insert', values }
        state.writes.push(pending)
        return b
      },
      update(values: Record<string, unknown>) {
        pending = { table, op: 'update', values }
        state.writes.push(pending)
        return b
      },
      upsert(values: Record<string, unknown>) {
        pending = { table, op: 'upsert', values }
        state.writes.push(pending)
        return b
      },
      eq: () => b,
      neq: () => b,
      limit: () => b,
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    }
    return b
  }

  return {
    from: (table: string) => builder(table),
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_webhook_event') {
        const status =
          state.claimStatus ??
          (state.existingEvent
            ? state.existingEvent.processed_at
              ? 'completed'
              : 'processing'
            : 'claimed')
        if (status === 'claimed') {
          state.writes.push({
            table: 'webhook_events',
            op: state.existingEvent ? 'update' : 'insert',
            values: {
              provider: args._provider,
              provider_event_id: args._provider_event_id,
              event_type: args._event_type,
              payload: args._payload,
            },
          })
        }
        return Promise.resolve({
          data: [{ event_id: 'wh-row-1', claim_status: status, current_attempt_count: 1 }],
          error: null,
        })
      }
      if (name === 'complete_webhook_event') {
        state.writes.push({
          table: 'webhook_events',
          op: 'update',
          values: { processed_at: '2026-08-08T00:00:00.000Z' },
        })
        return Promise.resolve({ data: true, error: null })
      }
      if (name === 'fail_webhook_event') {
        state.writes.push({
          table: 'webhook_events',
          op: 'update',
          values: { error: args._last_error, last_error: args._last_error },
        })
        return Promise.resolve({ data: true, error: null })
      }
      if (name === 'claim_webhook_business_effect') {
        const key = `${args._provider}:${args._provider_event_id}:${args._effect_type}:${args._target_id}`
        const claimed = !state.businessEffects.has(key)
        state.businessEffects.add(key)
        return Promise.resolve({ data: claimed, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: { email: `${id}@example.com` } }, error: null }),
      },
    },
  }
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeAdmin() }))

vi.mock('@/lib/email/send', () => ({
  sendEmail: (o: { to: string; subject: string }) => {
    state.emails.push({ to: o.to, subject: o.subject })
    return Promise.resolve(true)
  },
}))

vi.mock('@/lib/billing/downgrade-tenant', () => ({
  downgradeTenantToFreeIfCurrent: vi.fn(() => Promise.resolve(10)),
}))

// The reconciler has its own suite (platform-plan-change.test.ts). What matters
// here is that the dispatcher REACHES it — before #544 it never did.
vi.mock('@/lib/payments/platform-plan-change', () => ({
  applyPortalPlanChange: vi.fn(() => Promise.resolve({ action: 'noop' })),
}))

// Real normalizer, fake signature check. Signature verification is Stripe's own
// code; the route's contract is "reject anything verifyWebhook rejects".
vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  const { StripePaymentProvider } = await import('@/lib/payments/stripe-provider')
  const real = new StripePaymentProvider('sk_test_fake_for_unit_tests')
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      provider: 'stripe',
      capabilities: real.capabilities,
      verifyWebhook: (_body: string, headers: Record<string, string>) =>
        Promise.resolve(headers['stripe-signature'] === 'sig_ok'),
      normalizeWebhookEvent: (body: string) => real.normalizeWebhookEvent(body),
      updateSubscription: vi.fn(() => Promise.resolve({})),
    }),
  }
})

import { POST } from '@/app/api/billing/webhook/[provider]/route'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'
import { downgradeTenantToFreeIfCurrent } from '@/lib/billing/downgrade-tenant'

const TENANT = '00000000-0000-0000-0000-000000000001'
const PLAN_ID = 'f9318c3a-815d-448d-802e-cf356c2791a4'

const PERIOD_START = 1_770_000_000
const PERIOD_END = 1_772_592_000
const START_ISO = new Date(PERIOD_START * 1000).toISOString()
const END_ISO = new Date(PERIOD_END * 1000).toISOString()

/** A clover-shaped Subscription: periods live on the item, not the subscription. */
function cloverSubscription(over: { priceId?: string; recurringInterval?: string } = {}) {
  const { priceId = 'price_pro_m', recurringInterval = 'month' } = over
  return {
    id: 'sub_123',
    object: 'subscription',
    status: 'active',
    customer: 'cus_1',
    cancel_at_period_end: false,
    canceled_at: null,
    metadata: { tenant_id: TENANT },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          price: { id: priceId, recurring: { interval: recurringInterval } },
        },
      ],
    },
  }
}

function makeEvent(type: string, object: unknown, id = 'evt_1') {
  return { id, type, api_version: '2026-02-25.clover', data: { object } }
}

function makeReq(event: unknown, sig: string | null = 'sig_ok'): NextRequest {
  const body = JSON.stringify(event)
  return {
    text: () => Promise.resolve(body),
    headers: new Headers(sig ? { 'stripe-signature': sig } : {}),
  } as unknown as NextRequest
}

const params = (provider = 'stripe') => ({ params: Promise.resolve({ provider }) })

const writesTo = (table: string, op?: Write['op']) =>
  state.writes.filter((w) => w.table === table && (!op || w.op === op))

const businessWrites = () => state.writes.filter((w) => w.table !== 'webhook_events')

beforeEach(() => {
  process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_test_not_real'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key-for-tests'
  state.existingEvent = null
  state.claimStatus = null
  state.storedSub = null
  state.planPriceRow = null
  state.plan = { transaction_fee_percent: 2 }
  state.adminUsers = []
  state.failOn = null
  state.writes = []
  state.emails = []
  state.businessEffects = new Set()
  vi.mocked(applyPortalPlanChange).mockClear()
  vi.mocked(downgradeTenantToFreeIfCurrent).mockClear()
})

describe('platform billing webhook — route gates', () => {
  it('404s an unknown provider without reading the body', async () => {
    const res = await POST(makeReq(makeEvent('invoice.paid', {})), params('nope'))
    expect(res.status).toBe(404)
    expect(state.writes).toHaveLength(0)
  })

  it('404s a provider with no signed webhook, so it is never a mutation surface', async () => {
    // `manual` and `solana` confirm out of band; exposing a route for them would
    // let anyone activate a school's plan with an unsigned POST.
    for (const provider of ['manual', 'solana', 'binance_personal']) {
      const res = await POST(makeReq(makeEvent('invoice.paid', {})), params(provider))
      expect(res.status).toBe(404)
    }
    expect(state.writes).toHaveLength(0)
  })

  it('400s on a bad signature, without touching the DB', async () => {
    const res = await POST(makeReq(makeEvent('invoice.paid', {}), 'sig_bad'), params())
    expect(res.status).toBe(400)
    expect(state.writes).toHaveLength(0)
  })

  it('acks an event type we do not model, so the provider stops retrying', async () => {
    const res = await POST(makeReq(makeEvent('customer.discount.created', {})), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ignored: true })
    expect(state.writes).toHaveLength(0)
  })
})

describe('platform billing webhook — idempotency', () => {
  const session = {
    id: 'cs_1',
    mode: 'subscription',
    customer: 'cus_1',
    subscription: 'sub_123',
    metadata: { tenant_id: TENANT, plan_id: PLAN_ID, plan_slug: 'pro', interval: 'monthly' },
  }

  it('records the event under a namespace of its own, not the student one', async () => {
    await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    const inserted = writesTo('webhook_events', 'insert')[0]
    // The student Connect route logs under plain 'stripe'. Both endpoints can be
    // registered for the same event types on the SAME Stripe account, so one
    // shared key space would let whichever ran first mark an event processed and
    // make the other skip work it had not done.
    expect(inserted.values.provider).toBe('platform:stripe')
    expect(inserted.values.provider_event_id).toBe('evt_1')
  })

  it('replaying a processed event writes nothing and reports duplicate', async () => {
    // First delivery.
    const first = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(first.status).toBe(200)
    expect(businessWrites().length).toBeGreaterThan(0)

    // Second delivery of the SAME provider event id, now already processed.
    state.writes = []
    state.existingEvent = { id: 'wh-row-1', processed_at: '2026-08-06T00:00:00.000Z' }

    const second = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(second.status).toBe(200)
    expect(await second.json()).toMatchObject({ duplicate: true })
    expect(state.writes).toHaveLength(0)
  })

  it('acknowledges an active concurrent claim without dispatching or calling it completed', async () => {
    state.claimStatus = 'processing'
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(res.status).toBe(409)
    expect(res.headers.get('retry-after')).toBe('30')
    expect(await res.json()).toMatchObject({
      processing: true,
      eventStatus: 'already_processing',
    })
    expect(businessWrites()).toHaveLength(0)
  })

  it('does not reuse an unfinished event while its lease is active', async () => {
    state.existingEvent = { id: 'wh-row-1', processed_at: null }
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(res.status).toBe(409)
    expect(writesTo('webhook_events', 'insert')).toHaveLength(0)
    expect(businessWrites()).toHaveLength(0)
  })

  it('dispatches a half-finished event only after the database reclaims its expired lease', async () => {
    state.existingEvent = { id: 'wh-row-1', processed_at: null }
    state.claimStatus = 'claimed'
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(res.status).toBe(200)
    expect(writesTo('webhook_events', 'insert')).toHaveLength(0)
    expect(businessWrites().length).toBeGreaterThan(0)
  })
})

describe('platform billing webhook — activation', () => {
  const session = {
    id: 'cs_1',
    mode: 'subscription',
    customer: 'cus_1',
    subscription: 'sub_123',
    metadata: { tenant_id: TENANT, plan_id: PLAN_ID, plan_slug: 'pro', interval: 'monthly' },
  }

  it('activates the plan, records the customer and rewrites the revenue split', async () => {
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(res.status).toBe(200)

    const sub = writesTo('platform_subscriptions', 'upsert')[0]
    expect(sub).toBeDefined()
    expect(sub.values).toMatchObject({
      tenant_id: TENANT,
      plan_id: PLAN_ID,
      provider_subscription_id: 'sub_123',
      provider_customer_id: 'cus_1',
      status: 'active',
      payment_provider: 'stripe',
      interval: 'monthly',
    })

    expect(writesTo('tenants', 'update')[0].values).toMatchObject({
      plan: 'pro',
      billing_status: 'active',
    })

    // The customer id lives per-provider in tenant_billing_customers (#601).
    expect(writesTo('tenant_billing_customers', 'upsert')[0].values).toMatchObject({
      tenant_id: TENANT,
      payment_provider: 'stripe',
      provider_customer_id: 'cus_1',
    })

    expect(writesTo('revenue_splits', 'upsert')[0].values).toMatchObject({
      tenant_id: TENANT,
      platform_percentage: 2,
      school_percentage: 98,
    })
  })

  it('ignores a non-subscription checkout session', async () => {
    const res = await POST(
      makeReq(makeEvent('checkout.session.completed', { ...session, mode: 'payment' })),
      params(),
    )
    expect(res.status).toBe(200)
    expect(state.writes).toHaveLength(0)
  })

  it('500s and leaves the event unprocessed when a write fails', async () => {
    state.failOn = (w) =>
      w.table === 'platform_subscriptions' && w.op === 'upsert'
        ? { message: 'new row violates check constraint' }
        : null

    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)), params())
    expect(res.status).toBe(500)

    const eventWrites = writesTo('webhook_events', 'update')
    expect(eventWrites).toHaveLength(1)
    expect(eventWrites[0].values.error).toContain('check constraint')
    expect(eventWrites.some((w) => 'processed_at' in w.values)).toBe(false)
    // It stopped before the downstream writes.
    expect(writesTo('tenants', 'update')).toHaveLength(0)
    expect(writesTo('revenue_splits', 'upsert')).toHaveLength(0)
  })
})

describe('platform billing webhook — subscription updates', () => {
  // A subscription update always follows an activation, so these start from a
  // row that already exists. That is not decoration: `platform_subscriptions`
  // has a NOT NULL `plan_id`, and the upsert PostgREST sends must satisfy it on
  // every write. A test that updates a subscription no row was ever written for
  // is testing a state the database cannot hold (#605).
  const withStoredSub = (over: Record<string, unknown> = {}) => {
    state.storedSub = {
      tenant_id: TENANT,
      plan_id: PLAN_ID,
      status: 'active',
      current_period_end: null,
      ...over,
    }
  }

  it('writes status, interval and both periods off the clover item', async () => {
    withStoredSub()
    const res = await POST(
      makeReq(makeEvent('customer.subscription.updated', cloverSubscription())),
      params(),
    )
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'upsert')[0].values).toMatchObject({
      status: 'active',
      interval: 'monthly',
      current_period_start: START_ISO,
      current_period_end: END_ISO,
      cancel_at_period_end: false,
      canceled_at: null,
    })
    expect(writesTo('tenants', 'update')[0].values).toMatchObject({
      billing_status: 'active',
      billing_period_end: END_ISO,
    })
  })

  it('reaches the plan reconciler once the tenant has a plan on file', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    await POST(makeReq(makeEvent('customer.subscription.updated', cloverSubscription())), params())
    expect(applyPortalPlanChange).toHaveBeenCalledTimes(1)
    expect(vi.mocked(applyPortalPlanChange).mock.calls[0][0]).toMatchObject({
      provider: 'stripe',
      tenantId: TENANT,
      providerSubscriptionId: 'sub_123',
      providerPriceId: 'price_pro_m',
      interval: 'monthly',
    })
  })

  it('does not let stale checkout metadata rewrite the plan after the first activation', async () => {
    // The provider echoes our creation-time metadata on EVERY later event. If it
    // were trusted past the first write, a portal plan change would be reverted
    // to the plan the school originally bought, and the reconciler skipped.
    state.storedSub = { tenant_id: TENANT, plan_id: 'a-different-plan', status: 'active', current_period_end: null }
    const withMetadata = {
      ...cloverSubscription(),
      metadata: { tenant_id: TENANT, plan_id: PLAN_ID, plan_slug: 'pro' },
    }
    await POST(makeReq(makeEvent('customer.subscription.updated', withMetadata)), params())

    // The row keeps the plan it is ON, not the plan the metadata still claims.
    // Asserting plan_id is merely absent would be wrong now and was always
    // unachievable: the column is NOT NULL, so an upsert omitting it fails the
    // whole event rather than leaving the value alone (#605).
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.plan_id).toBe('a-different-plan')
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.plan_id).not.toBe(PLAN_ID)
    expect(writesTo('tenants', 'update')[0].values).not.toHaveProperty('plan')
    expect(applyPortalPlanChange).toHaveBeenCalledTimes(1)
  })

  it('tracks a monthly → yearly interval switch off the item price', async () => {
    withStoredSub()
    const yearly = cloverSubscription({ priceId: 'price_pro_y', recurringInterval: 'year' })
    await POST(makeReq(makeEvent('customer.subscription.updated', yearly)), params())
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.interval).toBe('yearly')
  })

  it('maps a status outside the CHECK set (paused) onto past_due', async () => {
    // The old Stripe-shaped route whitelisted statuses for exactly this reason:
    // passing Stripe's own vocabulary straight through fails the CHECK, and the
    // failure used to be discarded behind a 200 (#544).
    const paused = { ...cloverSubscription(), status: 'paused' }
    await POST(makeReq(makeEvent('customer.subscription.updated', paused)), params())
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('past_due')
  })

  it('keeps a status that IS in the CHECK set (unpaid) verbatim', async () => {
    const unpaid = { ...cloverSubscription(), status: 'unpaid' }
    await POST(makeReq(makeEvent('customer.subscription.updated', unpaid)), params())
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('unpaid')
  })

  it('mails the school only on the TRANSITION into dunning, not on every past_due event', async () => {
    // Stripe reports one failed charge twice — the invoice and the
    // subscription's own status change — plus any redelivery.
    state.adminUsers = ['admin-a']
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'past_due', current_period_end: null }
    const paused = { ...cloverSubscription(), status: 'paused' }
    await POST(makeReq(makeEvent('customer.subscription.updated', paused)), params())
    expect(state.emails).toHaveLength(0)
  })

  it('passes a canceled_at through as an ISO date', async () => {
    withStoredSub()
    const canceled = {
      ...cloverSubscription(),
      canceled_at: PERIOD_START,
      cancel_at_period_end: true,
    }
    await POST(makeReq(makeEvent('customer.subscription.updated', canceled)), params())
    expect(writesTo('platform_subscriptions', 'upsert')[0].values).toMatchObject({
      canceled_at: START_ISO,
      cancel_at_period_end: true,
    })
  })

  it('drops an out-of-order event carrying an older period — no rewind', async () => {
    const laterEnd = new Date((PERIOD_END + 86_400) * 1000).toISOString()
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: laterEnd }

    const res = await POST(
      makeReq(makeEvent('customer.subscription.updated', cloverSubscription())),
      params(),
    )
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'upsert')).toHaveLength(0)
    expect(writesTo('tenants', 'update')).toHaveLength(0)
    expect(applyPortalPlanChange).not.toHaveBeenCalled()
    // Still marked processed: handled as a deliberate no-op, so no retry.
    expect(writesTo('webhook_events', 'update')[0].values).toHaveProperty('processed_at')
  })

  it('applies an in-period update whose period end equals the stored one', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: END_ISO }
    const toggled = { ...cloverSubscription(), cancel_at_period_end: true }

    await POST(makeReq(makeEvent('customer.subscription.updated', toggled)), params())
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.cancel_at_period_end).toBe(true)
  })

  it('ignores a subscription that resolves to no tenant', async () => {
    const orphan = { ...cloverSubscription(), metadata: {} }
    await POST(makeReq(makeEvent('customer.subscription.updated', orphan)), params())
    expect(businessWrites()).toHaveLength(0)
    expect(applyPortalPlanChange).not.toHaveBeenCalled()
  })

  it('falls back to the stored row when the event carries no tenant metadata', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    const orphan = { ...cloverSubscription(), metadata: {} }
    await POST(makeReq(makeEvent('customer.subscription.updated', orphan)), params())
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.tenant_id).toBe(TENANT)
  })
})

describe('platform billing webhook — cancellation', () => {
  it('downgrades the tenant to free on subscription deletion', async () => {
    state.storedSub = {
      tenant_id: TENANT,
      plan_id: PLAN_ID,
      status: 'active',
      current_period_end: END_ISO,
      payment_provider: 'stripe',
      provider_subscription_id: 'sub_123',
    }
    const res = await POST(
      makeReq(makeEvent('customer.subscription.deleted', cloverSubscription())),
      params(),
    )
    expect(res.status).toBe(200)
    expect(downgradeTenantToFreeIfCurrent).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downgradeTenantToFreeIfCurrent).mock.calls[0].slice(1)).toEqual([
      TENANT,
      'stripe',
      'sub_123',
    ])
    // The whole transition belongs to that helper — duplicating any of it here
    // is how the cron path and the webhook path drift.
    expect(writesTo('platform_subscriptions', 'upsert')).toHaveLength(0)
  })
})

describe('platform billing webhook — invoices', () => {
  // Clover: the subscription id is under parent.subscription_details, and there
  // is no `invoice.subscription`.
  const cloverInvoice = {
    id: 'in_1',
    object: 'invoice',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_123' } },
    lines: { data: [{ period: { start: PERIOD_START, end: PERIOD_END } }] },
  }

  it('invoice.payment_failed → past_due on both tables + dunning email', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    state.adminUsers = ['admin-a', 'admin-b']

    const res = await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)), params())
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('past_due')
    expect(state.emails.map((e) => e.to).sort()).toEqual([
      'admin-a@example.com',
      'admin-b@example.com',
    ])
  })

  it('does not send dunning twice when the same event is re-dispatched after completion loss', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    state.adminUsers = ['admin-a']

    await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)), params())
    await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)), params())

    expect(state.emails.map((email) => email.to)).toEqual(['admin-a@example.com'])
  })

  it('invoice.payment_failed resolves the id from an expanded subscription object', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    const expanded = {
      ...cloverInvoice,
      parent: { subscription_details: { subscription: { id: 'sub_123', object: 'subscription' } } },
    }
    await POST(makeReq(makeEvent('invoice.payment_failed', expanded)), params())
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
  })

  it('invoice.payment_failed still reads a pre-clover invoice.subscription', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    await POST(
      makeReq(makeEvent('invoice.payment_failed', { id: 'in_1', subscription: 'sub_123' })),
      params(),
    )
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
  })

  it('invoice.payment_failed with no resolvable subscription is a no-op', async () => {
    await POST(makeReq(makeEvent('invoice.payment_failed', { id: 'in_1', parent: null })), params())
    expect(businessWrites()).toHaveLength(0)
  })

  it('invoice.paid clears past_due back to active and extends the period', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }

    const res = await POST(makeReq(makeEvent('invoice.paid', cloverInvoice)), params())
    expect(res.status).toBe(200)
    expect(writesTo('platform_subscriptions', 'upsert')[0].values).toMatchObject({
      status: 'active',
      current_period_end: END_ISO,
      // A paid period lets the next cycle remind again (#546).
      renewal_reminder_sent_at: null,
    })
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('active')
  })

  it('a failed past_due write 500s so the provider retries', async () => {
    state.storedSub = { tenant_id: TENANT, plan_id: PLAN_ID, status: 'active', current_period_end: null }
    state.failOn = (w) =>
      w.table === 'platform_subscriptions' && w.op === 'update' ? { message: 'boom' } : null

    const res = await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)), params())
    expect(res.status).toBe(500)
    expect(writesTo('webhook_events', 'update')[0].values.error).toContain('boom')
  })
})
