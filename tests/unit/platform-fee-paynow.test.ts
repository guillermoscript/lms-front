import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { FeeBalance } from '@/lib/payments/platform-fee-owed'

/**
 * #929 pay-now (design 2.4): `POST /api/billing/fees/checkout` and the pure
 * quote behind it. The amount is derived from the ledger, never taken from
 * the body (R7); automated rails are USD only (D6); manual is one open
 * request at a time; Stripe gets a hosted one-off session carrying the fee
 * metadata the webhook settles on.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'

const bal = (currency: string, netOwed: number): FeeBalance => ({
  currency,
  accrued: netOwed,
  paid: 0,
  netOwed,
  overpaid: 0,
  sales: 1,
})

const state = {
  user: { id: 'user-1' } as { id: string } | null,
  role: 'admin' as string | null,
  balances: [] as FeeBalance[],
  openFeeRequest: false,
  writes: [] as { table: string; kind: string; payload: unknown; filters: [string, unknown][] }[],
  paymentInsertError: null as null | { code: string; message: string },
  requestInsertError: null as null | { code: string; message: string },
  checkoutCalls: [] as Record<string, unknown>[],
  checkoutThrows: false,
}

function fakeAdmin() {
  return {
    from(table: string) {
      const op = { table, kind: 'select', payload: undefined as unknown, filters: [] as [string, unknown][] }
      const respond = () => {
        state.writes.push(op)
        if (op.kind === 'insert' && table === 'platform_fee_payments') {
          return state.paymentInsertError
            ? { data: null, error: state.paymentInsertError }
            : { data: { payment_id: 'pay-1' }, error: null }
        }
        if (op.kind === 'insert' && table === 'platform_payment_requests') {
          return state.requestInsertError
            ? { data: null, error: state.requestInsertError }
            : { data: { request_id: 'req-1' }, error: null }
        }
        if (table === 'tenant_billing_customers') return { data: { provider_customer_id: 'cus_1' }, error: null }
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
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(respond()).then(res, rej),
      }
      return b
    },
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: state.user }, error: null }) },
      from: () => {
        const b = {
          select: () => b,
          eq: () => b,
          maybeSingle: () => Promise.resolve({ data: state.role ? { role: state.role } : null, error: null }),
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
// The open-attempt guard on the hosted rails (#951) has its own suite:
// platform-fee-supersede.test.ts.
vi.mock('@/lib/billing/platform-fee-supersede', () => ({
  supersedeOpenFeeCheckouts: () => Promise.resolve({ ok: true, superseded: [] }),
}))
vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      createCheckoutSession: (params: Record<string, unknown>) => {
        if (state.checkoutThrows) return Promise.reject(new Error('stripe down'))
        state.checkoutCalls.push(params)
        return Promise.resolve({ kind: 'redirect', url: 'https://checkout.stripe.test/s', reference: 'r', providerRef: 'cs_1' })
      },
    }),
  }
})

import { POST } from '@/app/api/billing/fees/checkout/route'
import { quoteFeePayNow, FEE_PAY_NOW_PROVIDERS, toMinorUnits } from '@/lib/billing/platform-fee-paynow'

const req = (body: Record<string, unknown>) =>
  ({ json: () => Promise.resolve(body), headers: new Headers({ origin: 'https://school.lvh.me:3000' }) }) as unknown as NextRequest

beforeEach(() => {
  state.user = { id: 'user-1' }
  state.role = 'admin'
  state.balances = [bal('USD', 40), bal('EUR', 12.5)]
  state.openFeeRequest = false
  state.writes = []
  state.paymentInsertError = null
  state.requestInsertError = null
  state.checkoutCalls = []
  state.checkoutThrows = false
})

describe('quoteFeePayNow', () => {
  it('pay-now rails come from the capability flag: stripe, binance, paypal, solana, manual (#950; LS, solana_subs, binance_personal out)', () => {
    expect([...FEE_PAY_NOW_PROVIDERS].sort()).toEqual(['binance', 'manual', 'paypal', 'solana', 'stripe'])
  })

  it('defaults to the full balance and caps a requested amount at it', () => {
    const balances = [bal('USD', 40)]
    expect(quoteFeePayNow({ provider: 'stripe', balances })).toMatchObject({ ok: true, value: { amount: 40, partial: false } })
    expect(quoteFeePayNow({ provider: 'stripe', requested: 15.555, balances })).toMatchObject({ ok: true, value: { amount: 15.56, partial: true } })
    expect(quoteFeePayNow({ provider: 'stripe', requested: 9999, balances })).toMatchObject({ ok: true, value: { amount: 40, partial: false } })
  })

  it('refuses nonsense amounts, nothing owed, unsupported rails, and non-USD on automated rails', () => {
    const balances = [bal('USD', 40), bal('EUR', 5)]
    expect(quoteFeePayNow({ provider: 'stripe', requested: -1, balances })).toEqual({ ok: false, error: 'invalid_amount' })
    expect(quoteFeePayNow({ provider: 'stripe', requested: 'abc', balances })).toEqual({ ok: false, error: 'invalid_amount' })
    expect(quoteFeePayNow({ provider: 'stripe', balances: [bal('USD', 0)] })).toEqual({ ok: false, error: 'nothing_owed' })
    for (const p of ['lemonsqueezy', 'solana_subs', 'binance_personal']) {
      expect(quoteFeePayNow({ provider: p, balances })).toEqual({ ok: false, error: 'unsupported_rail' })
    }
    for (const p of ['paypal', 'binance', 'solana']) {
      expect(quoteFeePayNow({ provider: p, currency: 'eur', balances })).toEqual({ ok: false, error: 'currency_not_supported_on_rail' })
      expect(quoteFeePayNow({ provider: p, requested: 0.3, balances })).toEqual({ ok: false, error: 'amount_below_minimum' })
      expect(quoteFeePayNow({ provider: p, balances })).toMatchObject({ ok: true, value: { amount: 40 } })
    }
    expect(quoteFeePayNow({ provider: 'stripe', currency: 'eur', balances })).toEqual({ ok: false, error: 'currency_not_supported_on_rail' })
    expect(quoteFeePayNow({ provider: 'manual', currency: 'eur', balances })).toMatchObject({ ok: true, value: { currency: 'EUR', amount: 5 } })
    expect(quoteFeePayNow({ provider: 'stripe', requested: 0.3, balances })).toEqual({ ok: false, error: 'amount_below_minimum' })
    expect(quoteFeePayNow({ provider: 'manual', requested: 0.3, balances })).toMatchObject({ ok: true, value: { amount: 0.3 } })
  })

  it('converts to minor units without float drift', () => {
    expect(toMinorUnits(19.99)).toBe(1999)
    expect(toMinorUnits(0.1 + 0.2)).toBe(30)
  })
})

describe('POST /api/billing/fees/checkout', () => {
  it('401s anonymous and 403s a non-admin, writing nothing', async () => {
    state.user = null
    expect((await POST(req({ provider: 'stripe' }))).status).toBe(401)
    state.user = { id: 'user-1' }
    state.role = 'teacher'
    expect((await POST(req({ provider: 'stripe' }))).status).toBe(403)
    expect(state.writes).toHaveLength(0)
  })

  it('never takes the amount from the body: it only caps the ledger balance', async () => {
    const res = await POST(req({ provider: 'stripe', amount: 1_000_000 }))
    expect(res.status).toBe(200)
    const insert = state.writes.find((w) => w.table === 'platform_fee_payments' && w.kind === 'insert')
    expect(insert?.payload).toMatchObject({ tenant_id: TENANT, amount: 40, currency: 'USD', provider: 'stripe', status: 'pending' })
  })

  it('stripe: hosted one-off session with the fee metadata the webhook settles on', async () => {
    const res = await POST(req({ provider: 'stripe', amount: 25 }))
    const body = await res.json()
    expect(body).toMatchObject({ kind: 'redirect', url: 'https://checkout.stripe.test/s', paymentId: 'pay-1', amount: 25, partial: true })
    expect(state.checkoutCalls[0]).toMatchObject({
      mode: 'one_time',
      hosted: true,
      amount: 2500,
      currency: 'usd',
      providerCustomerId: 'cus_1',
      metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: 'pay-1' },
    })
    expect(String(state.checkoutCalls[0].successUrl)).toContain('/es/dashboard/admin/earnings')
    const ref = state.writes.find((w) => w.table === 'platform_fee_payments' && w.kind === 'update')
    expect(ref?.payload).toMatchObject({ provider_reference: 'cs_1' })
  })

  it('stripe: a provider failure marks the pending row failed and 502s', async () => {
    state.checkoutThrows = true
    const res = await POST(req({ provider: 'stripe' }))
    expect(res.status).toBe(502)
    const failed = state.writes.find((w) => w.table === 'platform_fee_payments' && w.kind === 'update')
    expect(failed?.payload).toMatchObject({ status: 'failed' })
  })

  it('stripe: a non-USD balance must go through the manual rail', async () => {
    const res = await POST(req({ provider: 'stripe', currency: 'EUR' }))
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('currency_not_supported_on_rail')
    expect(state.writes).toHaveLength(0)
  })

  it('manual: pending payment + a fee request (no plan), any currency', async () => {
    const res = await POST(req({ provider: 'manual', currency: 'EUR', bankReference: '  WIRE-9 ' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ kind: 'instructions', requestId: 'req-1', paymentId: 'pay-1', amount: 12.5, currency: 'EUR' })
    const request = state.writes.find((w) => w.table === 'platform_payment_requests' && w.kind === 'insert')
    expect(request?.payload).toMatchObject({
      tenant_id: TENANT,
      plan_id: null,
      fee_payment_id: 'pay-1',
      request_type: 'fee',
      amount: 12.5,
      currency: 'eur',
      payment_provider: 'manual',
      bank_reference: 'WIRE-9',
    })
    expect(state.checkoutCalls).toHaveLength(0)
  })

  it('manual: one open fee request at a time (409, nothing written)', async () => {
    state.openFeeRequest = true
    const res = await POST(req({ provider: 'manual' }))
    expect(res.status).toBe(409)
    expect(state.writes).toHaveLength(0)
  })

  it('manual: a failed request insert cancels the orphan payment row', async () => {
    state.requestInsertError = { code: '23514', message: 'check' }
    const res = await POST(req({ provider: 'manual' }))
    expect(res.status).toBe(500)
    const cancel = state.writes.find((w) => w.table === 'platform_fee_payments' && w.kind === 'update')
    expect(cancel?.payload).toMatchObject({ status: 'canceled' })
  })

  it('nothing owed / unsupported rail are 400 with a code', async () => {
    state.balances = []
    expect((await (await POST(req({ provider: 'stripe' }))).json()).code).toBe('nothing_owed')
    expect((await (await POST(req({ provider: 'lemonsqueezy' }))).json()).code).toBe('unsupported_rail')
  })
})
