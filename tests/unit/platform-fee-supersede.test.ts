import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeeBalance } from '@/lib/payments/platform-fee-owed'

/**
 * #951 — one open hosted fee checkout per tenant + rail. A new attempt on
 * Stripe / PayPal / Binance Pay supersedes the previous one: its checkout is
 * closed AT THE PROVIDER first and only then is its row cancelled, because
 * `settle_platform_fee_payment()` never credits a cancelled row. Every refusal
 * happens before the new row is inserted.
 *
 * The provider close (`closeFeeCheckoutAtProvider`) is the other half of the
 * issue and is mocked here; the fake admin applies the filters it is given, so
 * "left alone" means the query really excluded the row.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const OTHER_TENANT = '22222222-2222-2222-2222-222222222222'

type Row = Record<string, unknown>
type Filter = ['eq' | 'is' | 'in', string, unknown]
interface Op {
  table: string
  kind: 'select' | 'insert' | 'update'
  payload: unknown
  filters: Filter[]
  limit: number | null
}

const h = vi.hoisted(() => ({
  close: vi.fn(),
  payments: [] as Record<string, unknown>[],
  requests: [] as Record<string, unknown>[],
  errors: {} as Record<string, { code: string; message: string } | undefined>,
  ops: [] as {
    table: string
    kind: 'select' | 'insert' | 'update'
    payload: unknown
    filters: ['eq' | 'is' | 'in', string, unknown][]
    limit: number | null
  }[],
  // close calls and writes, in the order they happened
  log: [] as string[],
  balances: [] as unknown[],
  checkoutCalls: [] as Record<string, unknown>[],
}))

function fakeAdmin() {
  return {
    from(table: string) {
      const op: Op = { table, kind: 'select', payload: undefined, filters: [], limit: null }
      const source: Row[] =
        table === 'platform_fee_payments' ? h.payments : table === 'platform_payment_requests' ? h.requests : []
      const matches = (row: Row) =>
        op.filters.every(([type, k, v]) => (type === 'in' ? (v as unknown[]).includes(row[k]) : (row[k] ?? null) === v))
      const run = () => {
        h.ops.push(op)
        const error = h.errors[`${op.kind}:${table}`]
        if (error) return { rows: null, error }
        if (op.kind === 'insert') {
          const row: Row = {
            payment_id: 'pay-new',
            provider_reference: null,
            review_reason: null,
            created_at: new Date().toISOString(),
            ...(op.payload as Row),
          }
          source.push(row)
          h.log.push(`insert:${table}`)
          return { rows: [row], error: null }
        }
        const hit = source.filter(matches)
        if (op.kind === 'update') {
          for (const row of hit) {
            Object.assign(row, op.payload as Row)
            h.log.push(`update:${row.payment_id}:${(op.payload as Row).status ?? 'reference'}`)
          }
          return { rows: hit, error: null }
        }
        hit.sort((a, b) => Date.parse(String(a.created_at)) - Date.parse(String(b.created_at)))
        return { rows: op.limit === null ? hit : hit.slice(0, op.limit), error: null }
      }
      const many = () => {
        const { rows, error } = run()
        return { data: rows, error }
      }
      const one = () => {
        const { rows, error } = run()
        return { data: rows?.[0] ?? null, error }
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
          op.filters.push(['eq', k, v])
          return b
        },
        is(k: string, v: unknown) {
          op.filters.push(['is', k, v])
          return b
        },
        in(k: string, v: unknown[]) {
          op.filters.push(['in', k, v])
          return b
        },
        order: () => b,
        limit(n: number) {
          op.limit = n
          return b
        },
        single: () => Promise.resolve(one()),
        maybeSingle: () => Promise.resolve(one()),
        then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(many()).then(res, rej),
      }
      return b
    },
  }
}

vi.mock('@/lib/billing/platform-fee-checkout-close', () => ({ closeFeeCheckoutAtProvider: h.close }))
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
  return { ...actual, hasOpenPaymentRequest: () => Promise.resolve(false) }
})
vi.mock('@/lib/billing/platform-fee-paynow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-fee-paynow')>()
  return { ...actual, getTenantFeeBalances: () => Promise.resolve(h.balances) }
})
vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: () => ({
      createCheckoutSession: (params: Record<string, unknown>) => {
        h.checkoutCalls.push(params)
        h.log.push('checkout')
        return Promise.resolve({ kind: 'redirect', url: 'https://checkout.test/s', reference: 'r', providerRef: 'cs_new' })
      },
    }),
  }
})

import { POST } from '@/app/api/billing/fees/checkout/route'
import {
  FEE_CHECKOUT_OPENING_GRACE_MS,
  SUPERSEDE_SCAN_LIMIT,
  supersedeOpenFeeCheckouts,
  type SupersedeDeps,
} from '@/lib/billing/platform-fee-supersede'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const MINUTE = 60_000

const payment = (id: string, over: Row = {}): Row => ({
  payment_id: id,
  tenant_id: TENANT,
  provider: 'stripe',
  provider_reference: `cs_${id}`,
  amount: 40,
  currency: 'USD',
  status: 'pending',
  review_reason: null,
  created_at: new Date(NOW - 30 * MINUTE).toISOString(),
  ...over,
})

const admin = () => fakeAdmin() as unknown as SupabaseClient
const statusOf = (id: string) => h.payments.find((p) => p.payment_id === id)?.status
const writes = () => h.ops.filter((o) => o.kind !== 'select')

beforeEach(() => {
  h.close.mockReset().mockResolvedValue('closed')
  h.payments = []
  h.requests = []
  h.errors = {}
  h.ops = []
  h.log = []
  h.checkoutCalls = []
  const usd: FeeBalance = { currency: 'USD', accrued: 40, paid: 0, netOwed: 40, overpaid: 0, sales: 1 }
  h.balances = [usd]
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('supersedeOpenFeeCheckouts', () => {
  const run = (close: SupersedeDeps['close'] = h.close) =>
    supersedeOpenFeeCheckouts(admin(), { tenantId: TENANT, provider: 'stripe' }, { close, now: () => NOW })

  it('no open attempt: nothing to close, nothing written', async () => {
    expect(await run()).toEqual({ ok: true, superseded: [] })
    expect(h.close).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it('closes the previous checkout at the provider, THEN cancels its row', async () => {
    h.payments = [payment('old')]
    const close = vi.fn<NonNullable<SupersedeDeps['close']>>(async () => {
      // Still pending while the provider is asked.
      expect(statusOf('old')).toBe('pending')
      return 'closed' as const
    })

    expect(await run(close)).toEqual({ ok: true, superseded: ['old'] })

    expect(close).toHaveBeenCalledTimes(1)
    expect(close.mock.calls[0][1]).toEqual({
      payment_id: 'old',
      tenant_id: TENANT,
      provider: 'stripe',
      provider_reference: 'cs_old',
      amount: 40,
      currency: 'USD',
    })
    expect(statusOf('old')).toBe('canceled')
    // Guarded on `pending`: a row settled in between is never overwritten.
    expect(writes()[0]).toMatchObject({
      kind: 'update',
      payload: { status: 'canceled' },
      filters: expect.arrayContaining([
        ['eq', 'payment_id', 'old'],
        ['eq', 'status', 'pending'],
      ]),
    })
  })

  it('a rail that cannot be asked (`unsupported`) is cancelled too', async () => {
    h.payments = [payment('old')]
    h.close.mockResolvedValue('unsupported')

    expect(await run()).toEqual({ ok: true, superseded: ['old'] })
    expect(statusOf('old')).toBe('canceled')
  })

  it('`paid`: the money is in motion, so the row is NEVER cancelled', async () => {
    h.payments = [payment('old')]
    h.close.mockResolvedValue('paid')

    expect(await run()).toEqual({ ok: false, reason: 'payment_in_progress', paymentId: 'old', superseded: [] })
    expect(statusOf('old')).toBe('pending')
    expect(writes()).toEqual([])
  })

  it('`unknown` (or a close that throws) refuses and writes nothing', async () => {
    h.payments = [payment('old')]
    h.close.mockResolvedValue('unknown')
    expect(await run()).toMatchObject({ ok: false, reason: 'provider_unknown', paymentId: 'old' })

    h.close.mockRejectedValue(new Error('timeout'))
    expect(await run()).toMatchObject({ ok: false, reason: 'provider_unknown', paymentId: 'old' })

    expect(statusOf('old')).toBe('pending')
    expect(writes()).toEqual([])
  })

  it('a row still opening its checkout (no reference, inside the grace) refuses before anything is closed', async () => {
    h.payments = [
      // Older and closable: must NOT be touched, a double submit writes nothing.
      payment('old'),
      payment('opening', { provider_reference: null, created_at: new Date(NOW - FEE_CHECKOUT_OPENING_GRACE_MS + 1000).toISOString() }),
    ]

    expect(await run()).toEqual({ ok: false, reason: 'checkout_opening', paymentId: 'opening', superseded: [] })
    expect(h.close).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
  })

  it('a reference-less row past the grace is a dead attempt: asked, then cancelled', async () => {
    h.payments = [
      payment('crashed', { provider_reference: null, created_at: new Date(NOW - FEE_CHECKOUT_OPENING_GRACE_MS).toISOString() }),
    ]

    expect(await run()).toEqual({ ok: true, superseded: ['crashed'] })
    expect(h.close.mock.calls[0][1]).toMatchObject({ payment_id: 'crashed', provider_reference: null })
    expect(statusOf('crashed')).toBe('canceled')
  })

  it('a row under review neither blocks nor is cancelled', async () => {
    h.payments = [payment('flagged', { review_reason: 'amount/currency mismatch: expected 40 USD, provider reported 4 USD' })]

    expect(await run()).toEqual({ ok: true, superseded: [] })
    expect(h.close).not.toHaveBeenCalled()
    expect(statusOf('flagged')).toBe('pending')
  })

  it('the money row of a payment request belongs to the request, not to supersede', async () => {
    h.payments = [payment('requested'), payment('old')]
    h.requests = [{ request_id: 'req-1', tenant_id: TENANT, fee_payment_id: 'requested' }]

    expect(await run()).toEqual({ ok: true, superseded: ['old'] })
    expect(h.close).toHaveBeenCalledTimes(1)
    expect(statusOf('requested')).toBe('pending')
  })

  it('same rail and same tenant only; settled rows are not candidates', async () => {
    h.payments = [
      payment('paypal-open', { provider: 'paypal' }),
      payment('other-school', { tenant_id: OTHER_TENANT }),
      payment('settled', { status: 'succeeded' }),
      payment('old'),
    ]

    expect(await run()).toEqual({ ok: true, superseded: ['old'] })
    expect(statusOf('paypal-open')).toBe('pending')
    expect(statusOf('other-school')).toBe('pending')
    expect(statusOf('settled')).toBe('succeeded')
  })

  it('several open rows: each is handled; a refusal keeps what was already superseded and stops', async () => {
    h.payments = [
      payment('first', { created_at: new Date(NOW - 50 * MINUTE).toISOString() }),
      payment('second', { created_at: new Date(NOW - 40 * MINUTE).toISOString() }),
      payment('third', { created_at: new Date(NOW - 30 * MINUTE).toISOString() }),
    ]
    h.close.mockResolvedValueOnce('closed').mockResolvedValueOnce('paid')

    expect(await run()).toEqual({ ok: false, reason: 'payment_in_progress', paymentId: 'second', superseded: ['first'] })
    expect(h.close).toHaveBeenCalledTimes(2)
    expect([statusOf('first'), statusOf('second'), statusOf('third')]).toEqual(['canceled', 'pending', 'pending'])
  })

  it('scans a bounded number of rows', async () => {
    h.payments = [payment('old')]
    await run()
    expect(h.ops[0]).toMatchObject({ table: 'platform_fee_payments', kind: 'select', limit: SUPERSEDE_SCAN_LIMIT })
  })

  it('a failed ledger read refuses without asking the provider', async () => {
    h.payments = [payment('old')]
    h.errors['select:platform_fee_payments'] = { code: '57014', message: 'timeout' }
    expect(await run()).toMatchObject({ ok: false, reason: 'lookup_failed' })

    h.errors = { 'select:platform_payment_requests': { code: '57014', message: 'timeout' } }
    expect(await run()).toMatchObject({ ok: false, reason: 'lookup_failed' })

    expect(h.close).not.toHaveBeenCalled()
  })

  it('a failed cancel refuses: the caller must not stack a new row on an open one', async () => {
    h.payments = [payment('old')]
    h.errors['update:platform_fee_payments'] = { code: '57014', message: 'timeout' }

    expect(await run()).toEqual({ ok: false, reason: 'lookup_failed', paymentId: 'old', superseded: [] })
    expect(statusOf('old')).toBe('pending')
  })

  it('defaults to the real provider close when none is injected', async () => {
    h.payments = [payment('old', { created_at: new Date(Date.now() - 30 * MINUTE).toISOString() })]

    expect(await supersedeOpenFeeCheckouts(admin(), { tenantId: TENANT, provider: 'stripe' })).toEqual({
      ok: true,
      superseded: ['old'],
    })
    expect(h.close).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/billing/fees/checkout — hosted rails supersede (#951)', () => {
  const req = (body: Record<string, unknown>) =>
    ({
      json: () => Promise.resolve(body),
      headers: new Headers({ origin: 'https://school.lvh.me:3000' }),
    }) as unknown as NextRequest
  const old = (over: Row = {}) => payment('old', { created_at: new Date(Date.now() - 30 * MINUTE).toISOString(), ...over })
  const inserted = () => h.ops.filter((o) => o.kind === 'insert' && o.table === 'platform_fee_payments')

  it('a retry replaces the previous attempt: close, cancel, then the new row and its checkout', async () => {
    h.payments = [old()]
    h.close.mockImplementation(async () => {
      h.log.push('close:old')
      return 'closed'
    })

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(200)
    expect((await res.json()).paymentId).toBe('pay-new')
    expect(h.log).toEqual([
      'close:old',
      'update:old:canceled',
      'insert:platform_fee_payments',
      'checkout',
      'update:pay-new:reference',
    ])
    // Exactly one open attempt is left on the rail, with its own amount and reference.
    expect(h.payments.filter((p) => p.status === 'pending')).toEqual([
      expect.objectContaining({ payment_id: 'pay-new', amount: 40, provider: 'stripe', provider_reference: 'cs_new' }),
    ])
    expect(h.payments.find((p) => p.payment_id === 'old')).toMatchObject({ amount: 40, provider_reference: 'cs_old' })
  })

  it.each(['paypal', 'binance'])('%s is superseded on its own rail', async (provider) => {
    h.payments = [old({ provider }), payment('stripe-open', { created_at: new Date(Date.now() - 30 * MINUTE).toISOString() })]

    const res = await POST(req({ provider }))

    expect(res.status).toBe(200)
    expect(h.close).toHaveBeenCalledTimes(1)
    expect(h.close.mock.calls[0][1]).toMatchObject({ payment_id: 'old', provider })
    expect(statusOf('old')).toBe('canceled')
    // The other rail's leftover is the stale sweep's job.
    expect(statusOf('stripe-open')).toBe('pending')
  })

  it('409 fee_payment_in_progress when the previous checkout was paid: no new row, no checkout', async () => {
    h.payments = [old()]
    h.close.mockResolvedValue('paid')

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('fee_payment_in_progress')
    expect(writes()).toEqual([])
    expect(h.checkoutCalls).toEqual([])
    expect(statusOf('old')).toBe('pending')
  })

  it('409 fee_checkout_opening on a double submit, writing nothing', async () => {
    h.payments = [old({ provider_reference: null, created_at: new Date(Date.now() - 5000).toISOString() })]

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('fee_checkout_opening')
    expect(h.close).not.toHaveBeenCalled()
    expect(writes()).toEqual([])
    expect(h.checkoutCalls).toEqual([])
  })

  it('502 provider_error when the rail does not answer, writing nothing', async () => {
    h.payments = [old()]
    h.close.mockResolvedValue('unknown')

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('provider_error')
    expect(writes()).toEqual([])
    expect(h.checkoutCalls).toEqual([])
  })

  it('500 when the ledger cannot be read: no row is stacked blind', async () => {
    h.errors['select:platform_fee_payments'] = { code: '57014', message: 'timeout' }

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(500)
    expect(inserted()).toEqual([])
    expect(h.checkoutCalls).toEqual([])
  })

  it('a row under review does not block a new payment', async () => {
    h.payments = [old({ review_reason: 'provider reported a payment for a canceled row (charge ch_1)' })]

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(200)
    expect(h.close).not.toHaveBeenCalled()
    expect(statusOf('old')).toBe('pending')
    expect(inserted()).toHaveLength(1)
  })

  it('the manual rail is guarded by its request, not by supersede', async () => {
    h.payments = [old()]

    const res = await POST(req({ provider: 'manual' }))

    expect(res.status).toBe(201)
    expect(h.close).not.toHaveBeenCalled()
    expect(statusOf('old')).toBe('pending')
  })

  it('the checkout URL is not handed out when its reference could not be stored', async () => {
    h.errors['update:platform_fee_payments'] = { code: '57014', message: 'timeout' }

    const res = await POST(req({ provider: 'stripe' }))

    expect(res.status).toBe(500)
    expect((await res.json()).url).toBeUndefined()
  })
})
