import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Drives the platform Stripe webhook route end-to-end (issue #544).
 *
 * Every fixture here is shaped the way API version 2026-02-25.clover actually
 * delivers it — periods on `subscription.items.data[0]`, never on the
 * Subscription; the invoice's subscription under
 * `parent.subscription_details.subscription`, never `invoice.subscription`.
 * Before the fix the route read the pre-clover paths through an `any` cast, so
 * `checkout.session.completed` and `customer.subscription.updated` threw
 * `RangeError: Invalid time value` before writing anything, and both invoice
 * handlers hit a falsy id and silently broke out. Nothing in the suite caught
 * it because the only existing test called `applyPortalPlanChange` directly
 * with a hand-built object that omitted the period fields entirely.
 *
 * Fluent Supabase fake records every write, same approach as
 * platform-plan-change.test.ts / webhook-dispatch.test.ts.
 */

interface Write {
  table: string
  op: 'insert' | 'update' | 'upsert'
  values: Record<string, unknown>
}

const state: {
  existingEvent: { id: string; processed_at: string | null } | null
  insertErrorCode: string | null
  storedSub: Record<string, unknown> | null
  plan: { transaction_fee_percent: number } | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  retrievedSub: any
  adminUsers: string[]
  failOn: ((w: Write) => { message: string } | null) | null
  writes: Write[]
  selects: { table: string; cols: string }[]
  emails: { to: string; subject: string }[]
} = {
  existingEvent: null,
  insertErrorCode: null,
  storedSub: null,
  plan: null,
  retrievedSub: null,
  adminUsers: [],
  failOn: null,
  writes: [],
  selects: [],
  emails: [],
}

function readRow(table: string, cols: string): unknown {
  if (table === 'webhook_events') return state.existingEvent
  if (table === 'platform_plans') return state.plan
  if (table === 'platform_subscriptions') {
    // The email path joins the plan name off the same table.
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
        if (table === 'webhook_events' && pending.op === 'insert') {
          if (state.insertErrorCode) {
            return { data: null, error: { message: 'duplicate key', code: state.insertErrorCode } }
          }
          return { data: { id: 'wh-row-1' }, error: null }
        }
        return { data: null, error: null }
      }
      return { data: readRow(table, cols), error: null }
    }

    const b: Record<string, unknown> = {
      select(c: string) {
        cols = c
        state.selects.push({ table, cols: c })
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
      maybeSingle: () => Promise.resolve(settle()),
      single: () => Promise.resolve(settle()),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    }
    return b
  }

  return {
    from: (table: string) => builder(table),
    auth: {
      admin: {
        getUserById: (id: string) =>
          Promise.resolve({ data: { user: { email: `${id}@example.com` } }, error: null }),
      },
    },
  }
}

// Signature verification is Stripe's own code; the route's contract is "reject
// anything constructEvent throws on", so the fake throws for a bad signature
// and otherwise hands back the parsed body as the event.
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    webhooks: {
      constructEvent: (body: string, sig: string) => {
        if (sig !== 'sig_ok') throw new Error('No signatures found matching the expected signature')
        return JSON.parse(body)
      },
    },
    subscriptions: {
      retrieve: () => Promise.resolve(state.retrievedSub),
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdmin() }))

vi.mock('@/lib/email/send', () => ({
  sendEmail: (o: { to: string; subject: string }) => {
    state.emails.push({ to: o.to, subject: o.subject })
    return Promise.resolve(true)
  },
}))

vi.mock('@/lib/billing/downgrade-tenant', () => ({
  downgradeTenantToFree: vi.fn(() => Promise.resolve(10)),
}))

// The reconciler itself is out of scope (#544 explicitly leaves
// platform-plan-change.ts alone and platform-plan-change.test.ts covers it).
// What matters here is that the handler REACHES it — it never did in production.
vi.mock('@/lib/payments/platform-plan-change', () => ({
  applyPortalPlanChange: vi.fn(() => Promise.resolve({ action: 'noop' })),
}))

import { POST } from '@/app/api/stripe/platform-webhook/route'
import { applyPortalPlanChange } from '@/lib/payments/platform-plan-change'
import { downgradeTenantToFree } from '@/lib/billing/downgrade-tenant'

const TENANT = '00000000-0000-0000-0000-000000000001'
const PLAN_ID = 'f9318c3a-815d-448d-802e-cf356c2791a4'

const PERIOD_START = 1_770_000_000
const PERIOD_END = 1_772_592_000
const START_ISO = new Date(PERIOD_START * 1000).toISOString()
const END_ISO = new Date(PERIOD_END * 1000).toISOString()

/** A clover-shaped Subscription: periods live on the item, not the subscription. */
function cloverSubscription(
  over: { priceId?: string; recurringInterval?: string } = {}
) {
  const { priceId = 'price_pro_m', recurringInterval = 'month' } = over

  return {
    id: 'sub_123',
    object: 'subscription',
    status: 'active',
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

const writesTo = (table: string, op?: Write['op']) =>
  state.writes.filter((w) => w.table === table && (!op || w.op === op))

const businessWrites = () => state.writes.filter((w) => w.table !== 'webhook_events')

beforeEach(() => {
  process.env.STRIPE_PLATFORM_WEBHOOK_SECRET = 'whsec_test_not_real'
  state.existingEvent = null
  state.insertErrorCode = null
  state.storedSub = null
  state.plan = { transaction_fee_percent: 2 }
  state.retrievedSub = cloverSubscription()
  state.adminUsers = []
  state.failOn = null
  state.writes = []
  state.selects = []
  state.emails = []
  vi.mocked(applyPortalPlanChange).mockClear()
  vi.mocked(downgradeTenantToFree).mockClear()
})

describe('platform webhook — signature gate', () => {
  it('400s with no stripe-signature header, without touching the DB', async () => {
    const res = await POST(makeReq(makeEvent('invoice.paid', {}), null))
    expect(res.status).toBe(400)
    expect(state.writes).toHaveLength(0)
  })

  it('400s on a signature constructEvent rejects', async () => {
    const res = await POST(makeReq(makeEvent('invoice.paid', {}), 'sig_bad'))
    expect(res.status).toBe(400)
    expect(state.writes).toHaveLength(0)
  })
})

describe('platform webhook — checkout.session.completed', () => {
  const session = {
    id: 'cs_1',
    mode: 'subscription',
    customer: 'cus_1',
    subscription: 'sub_123',
    metadata: { tenant_id: TENANT, plan_id: PLAN_ID, plan_slug: 'pro', interval: 'monthly' },
  }

  it('activates the plan from a clover subscription (periods read off the item)', async () => {
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)))
    expect(res.status).toBe(200)

    // Regression: with the periods only on items.data[0], the old code did
    // `new Date(undefined * 1000).toISOString()` and threw before this upsert.
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
      current_period_start: START_ISO,
      current_period_end: END_ISO,
    })

    const tenant = writesTo('tenants', 'update')[0]
    expect(tenant.values).toMatchObject({
      plan: 'pro',
      billing_status: 'active',
      billing_period_end: END_ISO,
    })

    // The customer id moved off `tenants` into tenant_billing_customers (#601).
    const billingCustomer = writesTo('tenant_billing_customers', 'upsert')[0]
    expect(billingCustomer.values).toMatchObject({
      tenant_id: TENANT,
      payment_provider: 'stripe',
      provider_customer_id: 'cus_1',
    })

    const split = writesTo('revenue_splits', 'upsert')[0]
    expect(split.values).toMatchObject({
      tenant_id: TENANT,
      platform_percentage: 2,
      school_percentage: 98,
    })
  })

  it('still reads a pre-clover payload that carries the periods on the subscription', async () => {
    state.retrievedSub = {
      id: 'sub_123',
      status: 'active',
      metadata: { tenant_id: TENANT },
      current_period_start: PERIOD_START,
      current_period_end: PERIOD_END,
      items: { data: [{ id: 'si_1', price: { id: 'price_pro_m', recurring: { interval: 'month' } } }] },
    }
    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)))
    expect(res.status).toBe(200)
    expect(writesTo('platform_subscriptions', 'upsert')[0].values).toMatchObject({
      current_period_start: START_ISO,
      current_period_end: END_ISO,
    })
  })

  it('degrades instead of 500-ing when no period is resolvable at all', async () => {
    // Neither shape carries a period — a hypothetical future move of the field.
    state.retrievedSub = {
      id: 'sub_123',
      status: 'active',
      metadata: { tenant_id: TENANT },
      items: { data: [{ id: 'si_1', price: { id: 'price_pro_m', recurring: { interval: 'month' } } }] },
    }

    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)))
    expect(res.status).toBe(200)

    // Plan still activates; the period columns are omitted rather than written
    // as an invalid date (which is what used to throw).
    const values = writesTo('platform_subscriptions', 'upsert')[0].values
    expect(values.status).toBe('active')
    expect(values).not.toHaveProperty('current_period_start')
    expect(values).not.toHaveProperty('current_period_end')
    expect(writesTo('tenants', 'update')[0].values).not.toHaveProperty('billing_period_end')
  })

  it('pins a junk metadata interval onto the CHECK-allowed set', async () => {
    const junk = { ...session, metadata: { ...session.metadata, interval: 'weekly' } }
    await POST(makeReq(makeEvent('checkout.session.completed', junk)))
    expect(writesTo('platform_subscriptions', 'upsert')[0].values.interval).toBe('monthly')
  })

  it('ignores non-subscription checkout sessions', async () => {
    await POST(makeReq(makeEvent('checkout.session.completed', { ...session, mode: 'payment' })))
    expect(businessWrites()).toHaveLength(0)
  })

  it('500s and leaves the event unprocessed when a write fails', async () => {
    state.failOn = (w) =>
      w.table === 'platform_subscriptions' ? { message: 'new row violates check constraint' } : null

    const res = await POST(makeReq(makeEvent('checkout.session.completed', session)))
    expect(res.status).toBe(500)

    // The failure is recorded and processed_at stays unset so Stripe retries.
    const eventWrites = writesTo('webhook_events', 'update')
    expect(eventWrites).toHaveLength(1)
    expect(eventWrites[0].values.error).toContain('check constraint')
    expect(eventWrites.some((w) => 'processed_at' in w.values)).toBe(false)
    // It also stopped before the downstream writes.
    expect(writesTo('tenants', 'update')).toHaveLength(0)
    expect(writesTo('revenue_splits', 'upsert')).toHaveLength(0)
  })
})

describe('platform webhook — customer.subscription.updated', () => {
  it('writes status, interval and both periods, then reaches the plan reconciler', async () => {
    const res = await POST(makeReq(makeEvent('customer.subscription.updated', cloverSubscription())))
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'update')[0].values).toMatchObject({
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
    // #461's reconciler had never once executed — the handler threw at the
    // period access four lines earlier.
    expect(applyPortalPlanChange).toHaveBeenCalledTimes(1)
  })

  it('tracks a monthly → yearly interval switch off the item price', async () => {
    const yearly = cloverSubscription({ priceId: 'price_pro_y', recurringInterval: 'year' })
    await POST(makeReq(makeEvent('customer.subscription.updated', yearly)))
    expect(writesTo('platform_subscriptions', 'update')[0].values.interval).toBe('yearly')
  })

  it('maps a status outside the CHECK set (paused) onto past_due', async () => {
    const paused = { ...cloverSubscription(), status: 'paused' }
    await POST(makeReq(makeEvent('customer.subscription.updated', paused)))
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('past_due')
  })

  it('passes a canceled_at through as an ISO date', async () => {
    const canceled = { ...cloverSubscription(), canceled_at: PERIOD_START, cancel_at_period_end: true }
    await POST(makeReq(makeEvent('customer.subscription.updated', canceled)))
    expect(writesTo('platform_subscriptions', 'update')[0].values).toMatchObject({
      canceled_at: START_ISO,
      cancel_at_period_end: true,
    })
  })

  it('drops an out-of-order event carrying an older period — no rewind', async () => {
    // Stored row is already on the NEXT period; a late redelivery of the
    // previous one must not roll current_period_end / billing_period_end back.
    const laterEnd = new Date((PERIOD_END + 86_400) * 1000).toISOString()
    state.storedSub = { tenant_id: TENANT, status: 'active', current_period_end: laterEnd }

    const res = await POST(makeReq(makeEvent('customer.subscription.updated', cloverSubscription())))
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'update')).toHaveLength(0)
    expect(writesTo('tenants', 'update')).toHaveLength(0)
    expect(applyPortalPlanChange).not.toHaveBeenCalled()
    // Still marked processed: the event is handled (as a deliberate no-op),
    // so Stripe must not retry it.
    expect(writesTo('webhook_events', 'update')[0].values).toHaveProperty('processed_at')
  })

  it('applies an in-period update whose period end equals the stored one', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active', current_period_end: END_ISO }
    const toggled = { ...cloverSubscription(), cancel_at_period_end: true }

    await POST(makeReq(makeEvent('customer.subscription.updated', toggled)))

    expect(writesTo('platform_subscriptions', 'update')[0].values.cancel_at_period_end).toBe(true)
    expect(applyPortalPlanChange).toHaveBeenCalledTimes(1)
  })

  it('ignores a subscription with no tenant_id in metadata', async () => {
    const orphan = { ...cloverSubscription(), metadata: {} }
    await POST(makeReq(makeEvent('customer.subscription.updated', orphan)))
    expect(businessWrites()).toHaveLength(0)
    expect(applyPortalPlanChange).not.toHaveBeenCalled()
  })
})

describe('platform webhook — customer.subscription.deleted', () => {
  it('downgrades the tenant to free', async () => {
    const res = await POST(makeReq(makeEvent('customer.subscription.deleted', cloverSubscription())))
    expect(res.status).toBe(200)
    expect(downgradeTenantToFree).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downgradeTenantToFree).mock.calls[0][1]).toBe(TENANT)
  })
})

describe('platform webhook — invoice handlers', () => {
  // Clover: the subscription id is under parent.subscription_details, and there
  // is no `invoice.subscription`. The old `invoice.subscription as string` read
  // undefined and both handlers broke out without doing anything.
  const cloverInvoice = {
    id: 'in_1',
    object: 'invoice',
    parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_123' } },
  }

  it('invoice.payment_failed → past_due on both tables + dunning email', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active' }
    state.adminUsers = ['admin-a', 'admin-b']

    const res = await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)))
    expect(res.status).toBe(200)

    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('past_due')
    expect(state.emails.map((e) => e.to).sort()).toEqual([
      'admin-a@example.com',
      'admin-b@example.com',
    ])
  })

  it('invoice.payment_failed resolves the id from an expanded subscription object', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active' }
    const expanded = {
      ...cloverInvoice,
      parent: { subscription_details: { subscription: { id: 'sub_123', object: 'subscription' } } },
    }

    await POST(makeReq(makeEvent('invoice.payment_failed', expanded)))
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
  })

  it('invoice.payment_failed still reads a pre-clover invoice.subscription', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active' }
    await POST(makeReq(makeEvent('invoice.payment_failed', { id: 'in_1', subscription: 'sub_123' })))
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('past_due')
  })

  it('invoice.payment_failed with no resolvable subscription is a no-op', async () => {
    await POST(makeReq(makeEvent('invoice.payment_failed', { id: 'in_1', parent: null })))
    expect(businessWrites()).toHaveLength(0)
  })

  it('invoice.paid clears past_due back to active', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }

    const res = await POST(makeReq(makeEvent('invoice.paid', cloverInvoice)))
    expect(res.status).toBe(200)
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('active')
    expect(writesTo('tenants', 'update')[0].values.billing_status).toBe('active')
  })

  it('invoice.paid on an already-active subscription writes nothing', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active' }
    await POST(makeReq(makeEvent('invoice.paid', cloverInvoice)))
    expect(businessWrites()).toHaveLength(0)
  })

  it('a failed past_due write 500s so Stripe retries', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'active' }
    state.failOn = (w) => (w.table === 'tenants' ? { message: 'deadlock detected' } : null)

    const res = await POST(makeReq(makeEvent('invoice.payment_failed', cloverInvoice)))
    expect(res.status).toBe(500)
    expect(writesTo('webhook_events', 'update')[0].values.error).toContain('deadlock')
  })
})

describe('platform webhook — idempotency', () => {
  it('records the event under its own provider namespace and marks it processed', async () => {
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }
    await POST(makeReq(makeEvent('invoice.paid', { id: 'in_1', subscription: 'sub_123' }, 'evt_abc')))

    const inserted = writesTo('webhook_events', 'insert')[0]
    expect(inserted.values).toMatchObject({
      provider: 'stripe_platform',
      provider_event_id: 'evt_abc',
      event_type: 'invoice.paid',
    })
    expect(writesTo('webhook_events', 'update')[0].values).toHaveProperty('processed_at')
  })

  it('replaying a processed event.id is a complete no-op', async () => {
    state.existingEvent = { id: 'wh-row-1', processed_at: '2026-07-01T00:00:00.000Z' }
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }

    const res = await POST(makeReq(makeEvent('invoice.paid', { id: 'in_1', subscription: 'sub_123' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, duplicate: true })
    expect(state.writes).toHaveLength(0)
  })

  it('re-runs an event whose previous attempt failed before processed_at was set', async () => {
    state.existingEvent = { id: 'wh-row-1', processed_at: null }
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }

    const res = await POST(makeReq(makeEvent('invoice.paid', { id: 'in_1', subscription: 'sub_123' })))
    expect(res.status).toBe(200)
    // Reuses the row rather than inserting a second one.
    expect(writesTo('webhook_events', 'insert')).toHaveLength(0)
    expect(writesTo('platform_subscriptions', 'update')[0].values.status).toBe('active')
  })

  it('treats a concurrent delivery losing the unique race as a duplicate', async () => {
    state.insertErrorCode = '23505'
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }

    const res = await POST(makeReq(makeEvent('invoice.paid', { id: 'in_1', subscription: 'sub_123' })))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, duplicate: true })
    expect(businessWrites()).toHaveLength(0)
  })

  it('500s (no handling) when the event cannot be persisted at all', async () => {
    state.insertErrorCode = '08006'
    state.storedSub = { tenant_id: TENANT, status: 'past_due' }

    const res = await POST(makeReq(makeEvent('invoice.paid', { id: 'in_1', subscription: 'sub_123' })))
    expect(res.status).toBe(500)
    expect(businessWrites()).toHaveLength(0)
  })
})
