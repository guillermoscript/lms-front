/**
 * Guards on `POST /api/payments/binance-personal/verify`.
 *
 * The personal Binance rail has no webhook and no platform account: money goes
 * straight from buyer to school, and this polled endpoint is the only thing
 * that turns "the school says it arrived" into course access. The reconcile
 * library beneath it is well covered; the route was not covered at all.
 *
 * Binance itself is mocked — matching a real transfer is
 * `reconcileBinancePersonalTransaction`'s job and is tested there. What is
 * proven here is that nothing reaches Binance, and no sale settles, until
 * ownership, tenant, rail and status all check out, and that a client polling
 * every few seconds cannot emit a settlement more than once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_test_key'

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  tenantId: 'tenant-1',
  tx: null as Record<string, unknown> | null,
  pollLimited: false,
  historyLimited: false,
  config: { apiKey: 'k', apiSecret: 's', payId: '123' } as Record<string, unknown> | null,
  fetchThrows: false,
  filters: [] as Record<string, unknown>[],
  fetchCalls: 0,
  reconcileCalls: 0,
  reconcileResult: { status: 'pending' } as Record<string, unknown>,
  paymentEvents: 0,
}))

function txQuery() {
  const applied: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      applied[column] = value
      return builder
    },
    maybeSingle: () => {
      state.filters.push(applied)
      return Promise.resolve({ data: state.tx, error: null })
    },
  }
  return builder
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: null }) },
      from: () => txQuery(),
    }),
}))

vi.mock('@/lib/supabase/tenant', () => ({
  getCurrentTenantId: () => Promise.resolve(state.tenantId),
}))

vi.mock('@/lib/rate-limit', () => ({
  paymentPollLimiter: {
    check: () => (state.pollLimited ? Promise.reject(new Error('limited')) : Promise.resolve()),
  },
  binancePayHistoryLimiter: {
    check: () => (state.historyLimited ? Promise.reject(new Error('limited')) : Promise.resolve()),
  },
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: function eq() {
          return this
        },
        then: (resolve: (v: unknown) => void) => resolve({ count: 0 }),
      }),
    }),
  }),
}))

vi.mock('@/lib/payments/binance-personal-reconcile', () => ({
  loadBinancePersonalConfig: () => Promise.resolve(state.config),
  fetchTenantPayTransfers: () => {
    state.fetchCalls++
    if (state.fetchThrows) return Promise.reject(new Error('binance unreachable'))
    return Promise.resolve([])
  },
  reconcileBinancePersonalTransaction: () => {
    state.reconcileCalls++
    return Promise.resolve(state.reconcileResult)
  },
}))

vi.mock('@/lib/analytics/server', () => ({
  track: (event: string) => {
    if (event === 'payment_succeeded') state.paymentEvents++
    return Promise.resolve()
  },
  safeAnalytics: (fn: () => Promise<void>) => fn().catch(() => undefined),
}))

vi.mock('@/lib/analytics/events', () => ({
  ANALYTICS_EVENTS: { PAYMENT_SUCCEEDED: 'payment_succeeded', ENTITLEMENT_GRANTED: 'entitlement_granted' },
}))

const { POST } = await import('@/app/api/payments/binance-personal/verify/route')

function post(body: unknown) {
  return POST({ json: () => Promise.resolve(body) } as unknown as NextRequest)
}

const PENDING_TX = {
  transaction_id: 4242,
  status: 'pending',
  amount: 25,
  currency: 'usd',
  refunded_amount: 0,
  school_percentage_snapshot: 100,
  payment_provider: 'binance_personal',
  tenant_id: 'tenant-1',
  plan_id: null,
  product_id: 7,
  transaction_date: '2026-09-13T20:00:00.000Z',
}

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.tenantId = 'tenant-1'
  state.tx = { ...PENDING_TX }
  state.pollLimited = false
  state.historyLimited = false
  state.config = { apiKey: 'k', apiSecret: 's', payId: '123' }
  state.fetchThrows = false
  state.filters = []
  state.fetchCalls = 0
  state.reconcileCalls = 0
  state.reconcileResult = { status: 'pending' }
  state.paymentEvents = 0
})

describe('binance personal verify route guards', () => {
  it('refuses a request with no transaction id', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(state.fetchCalls).toBe(0)
  })

  it('refuses an anonymous caller', async () => {
    state.user = null
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(401)
    expect(state.fetchCalls).toBe(0)
  })

  it('rate-limits a polling client', async () => {
    state.pollLimited = true
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(429)
    expect(state.fetchCalls).toBe(0)
  })

  it('scopes the lookup to the caller AND their tenant', async () => {
    await post({ transactionId: 4242 })
    expect(state.filters[0]).toMatchObject({
      transaction_id: 4242,
      user_id: 'user-1',
      tenant_id: 'tenant-1',
    })
  })

  it('404s a transaction the caller does not own', async () => {
    state.tx = null
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(404)
    expect(state.fetchCalls).toBe(0)
  })

  it('refuses a transaction that belongs to another rail', async () => {
    state.tx = { ...PENDING_TX, payment_provider: 'stripe' }
    const res = await post({ transactionId: 4242 })
    expect(res.status).toBe(400)
    expect(state.fetchCalls).toBe(0)
  })

  it('answers a repeated poll on a settled sale without calling Binance', async () => {
    state.tx = { ...PENDING_TX, status: 'successful' }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: true, alreadyProcessed: true })
    expect(state.fetchCalls).toBe(0)
    expect(state.paymentEvents).toBe(0)
  })

  it('refuses when the school has not configured its Binance credentials', async () => {
    state.config = null
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(400)
    expect(state.fetchCalls).toBe(0)
  })

  it('keeps the client polling when the per-tenant Binance budget is spent', async () => {
    state.historyLimited = true
    const res = await post({ transactionId: 4242 })

    // Not an error: an erroring poll would strand a buyer who has already paid.
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: false, throttled: true })
    expect(state.fetchCalls).toBe(0)
  })

  it('reports Binance being unreachable as a retryable 503', async () => {
    state.fetchThrows = true
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(503)
    expect(state.reconcileCalls).toBe(0)
  })

  it('emits one settlement event for the poll that actually flipped the row', async () => {
    state.reconcileResult = { status: 'confirmed', alreadyProcessed: false }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ confirmed: true })
    expect(state.paymentEvents).toBe(1)
  })

  it('stays silent on a poll that lost the race to the cron', async () => {
    state.reconcileResult = { status: 'confirmed', alreadyProcessed: true }
    const res = await post({ transactionId: 4242 })

    expect(res.status).toBe(200)
    // One sale, one payment_succeeded — polling every few seconds must not
    // multiply revenue in analytics.
    expect(state.paymentEvents).toBe(0)
  })
})
