import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * The leftover-pending-row reuse in `/api/stripe/create-payment-intent`
 * (#754). Before this, the pending transaction was inserted BEFORE the card
 * form rendered; a buyer who closed the tab left that row inside
 * transactions_unique_product / transactions_unique_plan, Stripe never told us
 * (payment_intent.payment_failed needs an attempted card), and every retry
 * died on the insert with a 500.
 *
 * The route now asks Stripe about the buyer's own leftover row first:
 *   - still payable on the SAME terms → hand back its clientSecret, no insert
 *   - payable but the terms drifted → cancel it at Stripe, mark it 'canceled'
 *     (never 'failed' — a failed PLAN row cancels a live subscription), and
 *     proceed to a fresh insert
 *   - in flight / can't be released → 409 CHECKOUT_IN_FLIGHT, no insert
 *   - a non-stripe leftover (e.g. PayPal) → 409 immediately, Stripe never asked
 *
 * All writes (`transactions` insert/update, including the subscription-create
 * rollback and the post-PaymentIntent stripe_payment_intent_id write) run
 * through the ADMIN client per the coordinator's note — asserted below.
 */

type Row = Record<string, unknown>
interface Call {
  table: string
  op: 'select' | 'insert' | 'update'
  values?: Row
  filters: { eq: [string, unknown][]; is: [string, unknown][]; limit?: number }
}

function makeClient(handler: (call: Call) => { data: unknown; error: unknown }) {
  function builder(table: string) {
    let op: Call['op'] = 'select'
    let values: Row | undefined
    const filters: Call['filters'] = { eq: [], is: [] }
    const b: Record<string, unknown> = {
      select: () => b,
      insert: (v: Row) => {
        op = 'insert'
        values = v
        return b
      },
      update: (v: Row) => {
        op = 'update'
        values = v
        return b
      },
      eq: (col: string, val: unknown) => {
        filters.eq.push([col, val])
        return b
      },
      is: (col: string, val: unknown) => {
        filters.is.push([col, val])
        return b
      },
      limit: (n: number) => {
        filters.limit = n
        return b
      },
      order: () => b,
      single: () => Promise.resolve(handler({ table, op, values, filters })),
      maybeSingle: () => Promise.resolve(handler({ table, op, values, filters })),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(handler({ table, op, values, filters })).then(resolve),
    }
    return b
  }
  return { from: (t: string) => builder(t) }
}

const TENANT = 'tenant-1'
const USER = { id: 'user-1', email: 'buyer@example.com' }

interface State {
  profile: Row | null
  tenantRow: Row | null
  productRow: Row | null
  planRow: Row | null
  revenueSplit: Row | null
  leftover: Row | null
  insertResult: Row | null
  insertError: Row | null
  updateCalls: { values: Row; filters: Call['filters'] }[]
  insertCalls: Row[]
}

const state: State = {
  profile: null,
  tenantRow: null,
  productRow: null,
  planRow: null,
  revenueSplit: null,
  leftover: null,
  insertResult: null,
  insertError: null,
  updateCalls: [],
  insertCalls: [],
}

function makeUserSupabase() {
  const client = makeClient(({ table }) => {
    switch (table) {
      case 'profiles':
        return { data: state.profile, error: null }
      case 'tenants':
        return { data: state.tenantRow, error: null }
      case 'plans':
        return { data: state.planRow, error: state.planRow ? null : { message: 'not found' } }
      case 'products':
        return { data: state.productRow, error: state.productRow ? null : { message: 'not found' } }
      case 'revenue_splits':
        return { data: state.revenueSplit, error: null }
      default:
        return { data: null, error: null }
    }
  })
  return {
    ...client,
    auth: { getUser: () => Promise.resolve({ data: { user: USER }, error: null }) },
  }
}

function makeAdminClient() {
  return makeClient(({ table, op, values, filters }) => {
    if (table !== 'transactions') return { data: null, error: null }
    if (op === 'select') return { data: state.leftover, error: null }
    if (op === 'insert') {
      state.insertCalls.push(values!)
      return { data: state.insertError ? null : state.insertResult, error: state.insertError }
    }
    if (op === 'update') {
      state.updateCalls.push({ values: values!, filters })
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })
}

// --- Fake Stripe --------------------------------------------------------
const stripe = {
  paymentIntents: {
    retrieve: vi.fn(),
    cancel: vi.fn(),
    create: vi.fn(),
  },
  subscriptions: {
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  customers: {
    create: vi.fn(),
  },
}

const tracked: { event: string; props: Row; ctx: Row }[] = []
let createCheckoutSession = vi.fn()

vi.mock('@/lib/stripe', () => ({ getStripe: () => stripe }))
vi.mock('@/lib/supabase/server', () => ({ createClient: () => Promise.resolve(makeUserSupabase()) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeAdminClient() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve(TENANT) }))
vi.mock('@/lib/analytics/server', () => ({
  track: (event: string, props: Row, ctx: Row) => {
    tracked.push({ event, props, ctx })
    return Promise.resolve()
  },
  safeAnalytics: (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('@/lib/payments/tenant-payment-readiness', async importActual => {
  const actual = await importActual<typeof import('@/lib/payments/tenant-payment-readiness')>()
  return { ...actual, isReadyToAcceptPayments: () => Promise.resolve({ ready: true }) }
})
vi.mock('@/lib/payments/subscription-guard', async importActual => {
  const actual = await importActual<typeof import('@/lib/payments/subscription-guard')>()
  return { ...actual, findConflictingSubscription: () => Promise.resolve(null) }
})
vi.mock('@/lib/payments', async importActual => {
  const actual = await importActual<typeof import('@/lib/payments')>()
  return {
    ...actual,
    getPaymentProvider: (slug: string) => {
      if (slug !== 'stripe') throw new Error(`unexpected provider ${slug}`)
      return { createCheckoutSession }
    },
  }
})

import { POST } from '@/app/api/stripe/create-payment-intent/route'

function req(body: Row): NextRequest {
  return { json: () => Promise.resolve(body) } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  tracked.length = 0
  state.profile = { stripe_customer_id: 'cus_1', full_name: 'Buyer' }
  state.tenantRow = { stripe_account_id: 'acct_1' }
  state.productRow = { price: 50, name: 'Course', currency: 'usd' }
  state.planRow = null
  state.revenueSplit = { platform_percentage: 20 }
  state.leftover = null
  state.insertResult = { transaction_id: 100 }
  state.insertError = null
  state.updateCalls = []
  state.insertCalls = []
  createCheckoutSession = vi.fn()
})

// amount = toCents(50, 'usd') = 5000; platformFee = round(5000 * 20 / 100) = 1000
const EXPECTED_AMOUNT = 5000
const EXPECTED_FEE = 1000

describe('POST /api/stripe/create-payment-intent — leftover reuse (#754)', () => {
  it('(a) no leftover: inserts a pending row with checkout_expires_at and creates a fresh PaymentIntent', async () => {
    stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_new', client_secret: 'cs_new' })

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(json).toEqual({ clientSecret: 'cs_new', transactionId: 100 })
    expect(state.insertCalls).toHaveLength(1)
    expect(state.insertCalls[0].checkout_expires_at).toBeTypeOf('string')
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1)
    // The PaymentIntent id is persisted through the ADMIN client, not the
    // user-scoped one.
    const piWrite = state.updateCalls.find(c => c.values.stripe_payment_intent_id === 'pi_new')
    expect(piWrite).toBeDefined()
  })

  it('(b) leftover payable on matching terms: returns its clientSecret, no insert, no new PaymentIntent', async () => {
    state.leftover = {
      transaction_id: 55,
      payment_provider: 'stripe',
      stripe_payment_intent_id: 'pi_leftover',
      provider_subscription_id: null,
      transaction_date: new Date().toISOString(),
    }
    stripe.paymentIntents.retrieve.mockResolvedValue({
      status: 'requires_payment_method',
      client_secret: 'cs_leftover',
      amount: EXPECTED_AMOUNT,
      currency: 'usd',
      transfer_data: { destination: 'acct_1' },
      application_fee_amount: EXPECTED_FEE,
    })

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(json).toEqual({ clientSecret: 'cs_leftover', transactionId: 55 })
    expect(state.insertCalls).toHaveLength(0)
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled()
  })

  it('(c) leftover payable but the amount drifted: cancels it at Stripe, marks it canceled, then inserts + creates a new PaymentIntent', async () => {
    state.leftover = {
      transaction_id: 55,
      payment_provider: 'stripe',
      stripe_payment_intent_id: 'pi_leftover',
      provider_subscription_id: null,
      transaction_date: new Date().toISOString(),
    }
    stripe.paymentIntents.retrieve.mockResolvedValue({
      status: 'requires_payment_method',
      client_secret: 'cs_leftover',
      amount: 4000, // stale — the product price changed since
      currency: 'usd',
      transfer_data: { destination: 'acct_1' },
      application_fee_amount: EXPECTED_FEE,
    })
    stripe.paymentIntents.cancel.mockResolvedValue({})
    stripe.paymentIntents.create.mockResolvedValue({ id: 'pi_new', client_secret: 'cs_new' })

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_leftover')
    const cancelWrite = state.updateCalls.find(
      c => c.values.status === 'canceled' && c.filters.eq.some(([col, val]) => col === 'transaction_id' && val === 55),
    )
    expect(cancelWrite).toBeDefined()
    expect(cancelWrite!.values.status).not.toBe('failed')
    expect(state.insertCalls).toHaveLength(1)
    expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1)
    expect(json).toEqual({ clientSecret: 'cs_new', transactionId: 100 })
  })

  it('(d) leftover PaymentIntent already succeeded: 409 CHECKOUT_IN_FLIGHT, no insert, no release attempted', async () => {
    state.leftover = {
      transaction_id: 55,
      payment_provider: 'stripe',
      stripe_payment_intent_id: 'pi_leftover',
      provider_subscription_id: null,
      transaction_date: new Date().toISOString(),
    }
    stripe.paymentIntents.retrieve.mockResolvedValue({ status: 'succeeded' })

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toMatchObject({ code: 'CHECKOUT_IN_FLIGHT' })
    expect(state.insertCalls).toHaveLength(0)
    expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled()
  })

  it('(e) leftover from a different provider (paypal): 409 immediately, Stripe never consulted', async () => {
    state.leftover = {
      transaction_id: 77,
      payment_provider: 'paypal',
      stripe_payment_intent_id: null,
      provider_subscription_id: null,
      transaction_date: new Date().toISOString(),
    }

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toMatchObject({ code: 'CHECKOUT_IN_FLIGHT' })
    expect(state.insertCalls).toHaveLength(0)
    expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('(f) insert loses a race (23505): 409 CHECKOUT_IN_FLIGHT', async () => {
    state.leftover = null
    state.insertError = { code: '23505', message: 'duplicate key' }

    const res = await POST(req({ productId: 10 }))
    const json = await res.json()

    expect(res.status).toBe(409)
    expect(json).toMatchObject({ code: 'CHECKOUT_IN_FLIGHT' })
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('(g) native subscription plan: createCheckoutSession throws → the pending row is rolled back to canceled, never failed', async () => {
    state.planRow = {
      price: 20,
      plan_name: 'Pro',
      currency: 'usd',
      provider_price_id: 'price_123',
      payment_provider: 'stripe',
    }
    state.insertResult = { transaction_id: 900 }
    createCheckoutSession.mockRejectedValue(new Error('Stripe is down'))

    const res = await POST(req({ planId: 5 }))
    const json = await res.json()

    expect(res.status).toBe(500)
    expect(json).toEqual({ error: 'Failed to create subscription' })

    const rollback = state.updateCalls.find(c =>
      c.filters.eq.some(([col, val]) => col === 'transaction_id' && val === 900),
    )
    expect(rollback).toBeDefined()
    expect(rollback!.values).toEqual({ status: 'canceled' })
    expect(rollback!.values.status).not.toBe('failed')

    const failedEvent = tracked.find(t => t.event === 'payment_failed')
    expect(failedEvent).toBeDefined()
    expect(failedEvent!.props).toMatchObject({ stage: 'subscription_create', transaction_id: 900 })
  })
})
