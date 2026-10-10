import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { FeeBalance } from '@/lib/payments/platform-fee-owed'

/**
 * #950 — Solana branch of `POST /api/billing/fees/checkout`: config / open
 * request / quote refuse BEFORE any row is written; then a pending
 * `platform_fee_payments` row (provider solana) + a short-lived fee request
 * carrying the locked settlement and the QR reference. Amount from the ledger,
 * never the body.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'

const state = vi.hoisted(() => ({
  configured: true,
  openFeeRequest: false,
  quoteThrows: false,
  sessionRef: 'ref-pubkey' as string | undefined,
  requestInsertError: null as null | { message: string },
  writes: [] as { table: string; kind: string; payload: unknown; filters: [string, unknown][] }[],
  checkoutCalls: [] as Record<string, unknown>[],
  quoteCalls: [] as number[],
  balances: [] as FeeBalance[],
}))

function fakeAdmin() {
  return {
    from(table: string) {
      const op = { table, kind: 'select', payload: undefined as unknown, filters: [] as [string, unknown][] }
      const respond = () => {
        state.writes.push(op)
        if (op.kind === 'insert' && table === 'platform_fee_payments') {
          return { data: { payment_id: 'pay-950' }, error: null }
        }
        if (op.kind === 'insert' && table === 'platform_payment_requests') {
          return state.requestInsertError
            ? { data: null, error: state.requestInsertError }
            : { data: { request_id: 'req-950' }, error: null }
        }
        return { data: null, error: null }
      }
      const b = {
        insert(p: unknown) {
          op.kind = 'insert'
          op.payload = p
          return b
        },
        update(p: unknown) {
          op.kind = 'update'
          op.payload = p
          return b
        },
        select: () => b,
        eq(k: string, v: unknown) {
          op.filters.push([k, v])
          return b
        },
        single: () => Promise.resolve(respond()),
        maybeSingle: () => Promise.resolve(respond()),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          Promise.resolve(respond()).then(res, rej),
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }) },
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: { role: 'admin' }, error: null }),
        }
        return b
      },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/lib/supabase/tenant', () => ({ getCurrentTenantId: () => Promise.resolve(TENANT) }))
vi.mock('@/lib/i18n/request-locale', () => ({ resolveRequestLocale: () => 'es' }))
vi.mock('@/lib/billing/payment-request-ttl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/payment-request-ttl')>()
  return {
    ...actual,
    hasOpenPaymentRequest: (_a: unknown, _t: string, opts?: { kind?: string }) =>
      Promise.resolve(opts?.kind === 'fee' ? state.openFeeRequest : false),
  }
})
vi.mock('@/lib/billing/platform-fee-paynow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-fee-paynow')>()
  return { ...actual, getTenantFeeBalances: () => Promise.resolve(state.balances) }
})
vi.mock('@/lib/billing/solana-platform-payment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/solana-platform-payment')>()
  return {
    ...actual,
    getPlatformSolanaConfig: () => (state.configured ? { rpcUrl: 'https://rpc.example' } : null),
    quotePlatformSettlement: (amountUsd: number) => {
      state.quoteCalls.push(amountUsd)
      if (state.quoteThrows) return Promise.reject(new Error('price feed down'))
      return Promise.resolve({ currency: 'usdc', base: Math.round(amountUsd * 1e6), mint: 'mint-usdc', solUsd: null })
    },
  }
})
vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      createCheckoutSession: (params: Record<string, unknown>) => {
        state.checkoutCalls.push(params)
        return Promise.resolve({
          kind: 'qr',
          url: 'solana:https%3A%2F%2Fschool.lvh.me%3A3000%2Fapi%2Fbilling%2Fsolana%2Ftx%3Freference%3Dref-pubkey',
          reference: String(params.reference),
          providerRef: state.sessionRef,
        })
      },
    }),
  }
})

import { POST } from '@/app/api/billing/fees/checkout/route'
import { REQUEST_TTL_DAYS } from '@/lib/billing/payment-request-ttl'

const req = (body: Record<string, unknown>) =>
  ({
    json: () => Promise.resolve(body),
    headers: new Headers({ origin: 'https://school.lvh.me:3000' }),
  }) as unknown as NextRequest

const bal = (currency: string, netOwed: number): FeeBalance => ({
  currency,
  accrued: netOwed,
  paid: 0,
  netOwed,
  overpaid: 0,
  sales: 1,
})

const inserts = (table: string) => state.writes.filter((w) => w.table === table && w.kind === 'insert')
const updates = (table: string) => state.writes.filter((w) => w.table === table && w.kind === 'update')

beforeEach(() => {
  state.configured = true
  state.openFeeRequest = false
  state.quoteThrows = false
  state.sessionRef = 'ref-pubkey'
  state.requestInsertError = null
  state.writes = []
  state.checkoutCalls = []
  state.quoteCalls = []
  state.balances = [bal('USD', 40), bal('EUR', 12.5)]
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('POST /api/billing/fees/checkout — solana', () => {
  it('503s when the platform has no Solana config, writing nothing', async () => {
    state.configured = false

    const res = await POST(req({ provider: 'solana' }))

    expect(res.status).toBe(503)
    expect((await res.json()).code).toBe('provider_unavailable')
    expect(state.writes.filter((w) => w.kind !== 'select')).toEqual([])
  })

  it('409s while a fee request is open, writing nothing', async () => {
    state.openFeeRequest = true

    const res = await POST(req({ provider: 'solana' }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('fee_request_open')
    expect(state.writes.filter((w) => w.kind !== 'select')).toEqual([])
    expect(state.quoteCalls).toEqual([])
  })

  it('a non-USD balance is refused (automated rails are USD only)', async () => {
    const res = await POST(req({ provider: 'solana', currency: 'EUR' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('currency_not_supported_on_rail')
  })

  it('a quote failure (price feed) 502s before any row is written', async () => {
    state.quoteThrows = true

    const res = await POST(req({ provider: 'solana' }))

    expect(res.status).toBe(502)
    expect(state.writes.filter((w) => w.kind !== 'select')).toEqual([])
  })

  it('happy path: pending payment + a short-lived fee request with the locked settlement', async () => {
    const before = Date.now()
    const res = await POST(req({ provider: 'solana', amount: 25, locale: 'es' }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body).toMatchObject({
      kind: 'qr',
      provider: 'solana',
      requestId: 'req-950',
      paymentId: 'pay-950',
      checkoutPath: '/es/dashboard/admin/billing/checkout/req-950',
      amount: 25,
      currency: 'USD',
      netOwed: 40,
      partial: true,
    })
    expect(String(body.url)).toMatch(/^solana:/)

    expect(inserts('platform_fee_payments')[0].payload).toMatchObject({
      tenant_id: TENANT,
      provider: 'solana',
      status: 'pending',
      amount: 25,
      currency: 'USD',
    })
    // Quoted on the ledger amount, never anything else.
    expect(state.quoteCalls).toEqual([25])

    const request = inserts('platform_payment_requests')[0].payload as Record<string, unknown>
    expect(request).toMatchObject({
      tenant_id: TENANT,
      plan_id: null,
      fee_payment_id: 'pay-950',
      request_type: 'fee',
      payment_provider: 'solana',
      provider_reference: 'ref-pubkey',
      amount: 25,
      currency: 'usd',
      status: 'pending',
      settlement_currency: 'usdc',
      settlement_base: 25_000_000,
      settlement_mint: 'mint-usdc',
    })
    const ttlMs = new Date(String(request.expires_at)).getTime() - before
    expect(ttlMs).toBeGreaterThan(0)
    const ttlDays = REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000
    expect(ttlMs).toBeGreaterThanOrEqual(ttlDays - 5000)
    expect(ttlMs).toBeLessThanOrEqual(ttlDays + 5000)
    expect(body.expiresAt).toBe(request.expires_at)

    expect(state.checkoutCalls[0]).toMatchObject({
      hosted: true,
      mode: 'one_time',
      metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: 'pay-950' },
    })
    expect(updates('platform_fee_payments')[0].payload).toMatchObject({ provider_reference: 'ref-pubkey' })
  })

  it('never takes the amount from the body beyond capping it at the balance', async () => {
    const body = await (await POST(req({ provider: 'solana', amount: 9999 }))).json()
    expect(body.amount).toBe(40)
    expect(state.quoteCalls).toEqual([40])
  })

  it('a session without an on-chain reference fails the payment row and records no request', async () => {
    state.sessionRef = undefined

    const res = await POST(req({ provider: 'solana' }))

    expect(res.status).toBe(502)
    expect(inserts('platform_payment_requests')).toEqual([])
    expect(updates('platform_fee_payments')[0]).toMatchObject({
      payload: expect.objectContaining({ status: 'failed' }),
      filters: expect.arrayContaining([['payment_id', 'pay-950'], ['status', 'pending']]),
    })
  })

  it('a failed request insert cancels the orphan payment row', async () => {
    state.requestInsertError = { message: 'check violation' }

    const res = await POST(req({ provider: 'solana' }))

    expect(res.status).toBe(500)
    expect(updates('platform_fee_payments')[0]).toMatchObject({
      payload: expect.objectContaining({ status: 'canceled' }),
      filters: expect.arrayContaining([['payment_id', 'pay-950'], ['status', 'pending']]),
    })
  })
})
