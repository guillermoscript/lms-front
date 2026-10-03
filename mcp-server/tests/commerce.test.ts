/**
 * Commerce tools (#897): role gating, input schemas, the payment-request
 * transitions, and parity of the mirrored money arithmetic with the app's own
 * `lib/payments` modules (the MCP image cannot import them, so this is the
 * drift guard).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Every handler builds its client through createUserClient — swap in a fake.
const fake = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  results: new Map<string, unknown[]>(),
}))

vi.mock('../src/supabase.js', () => {
  function builder(table: string) {
    let op = 'select'
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (...args: unknown[]) => {
      if (name === 'update' || name === 'insert') op = name
      fake.calls.push({ table, op: name, args })
      return b
    }
    for (const m of ['select', 'eq', 'in', 'is', 'order', 'range', 'gte', 'lt', 'limit', 'update', 'insert']) {
      b[m] = chain(m)
    }
    const resolve = () => {
      const queue = fake.results.get(`${table}:${op}`) ?? []
      return Promise.resolve(queue.length ? queue.shift() : { data: null, error: null })
    }
    b.maybeSingle = () => resolve()
    b.single = () => resolve()
    b.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolve().then(ok, ko)
    return b
  }
  return {
    createUserClient: () => ({ from: (t: string) => builder(t), rpc: () => Promise.resolve({ data: null, error: null }) }),
    getServiceClient: () => null,
  }
})

import { isToolAllowedForRole, ADMIN_ONLY_COMMERCE_TOOLS } from '../src/tool-policy.js'
import {
  registerCommerceTools,
  listPaymentRequestsInput,
  listTransactionsInput,
  listSubscriptionsInput,
  confirmPaymentInput,
  listProductsInput,
  fetchAllPages,
} from '../src/tools/commerce.js'
import {
  FEE_BEARING_PROVIDERS,
  PLATFORM_SETTLED_PROVIDERS,
  computeSchoolRevenue,
  paymentRequestTransitionError,
  type RevenueRow,
} from '../src/commerce-math.js'
// The app's own modules — import-free, so they load here without the `@/` alias.
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '../../lib/payments/types'
import { computeOwedBalances } from '../../lib/payments/payouts-owed'
import { computeRevenueTotals, FEE_BEARING_PROVIDERS as APP_FEE_BEARING } from '../../lib/payments/revenue-share'

const TENANT = '00000000-0000-0000-0000-000000000001'
const ADMIN = '11111111-1111-1111-1111-111111111111'
const STUDENT = '22222222-2222-2222-2222-222222222222'

type Handler = (input: unknown, ctx: unknown) => Promise<{
  isError?: boolean
  content: { text: string }[]
  structuredContent?: Record<string, unknown>
}>

function registered() {
  const tools = new Map<string, { def: Record<string, unknown>; handler: Handler }>()
  const server = {
    tool: (def: Record<string, unknown>, handler: Handler) => {
      tools.set(def.name as string, { def, handler })
    },
  }
  registerCommerceTools(server as never)
  return tools
}

function ctxFor(role: string) {
  return {
    auth: {
      user: { id: ADMIN },
      accessToken: 'token',
      payload: { tenant_id: TENANT, tenant_role: role },
    },
  }
}

describe('commerce tool policy', () => {
  it('registers exactly the admin-only list, each with input and output schemas', () => {
    const tools = registered()
    expect([...tools.keys()].sort()).toEqual([...ADMIN_ONLY_COMMERCE_TOOLS].sort())
    for (const { def } of tools.values()) {
      expect(def.inputSchema).toBeDefined()
      expect(def.outputSchema).toBeDefined()
    }
  })

  it.each([...ADMIN_ONLY_COMMERCE_TOOLS])('%s is admin only', (name) => {
    expect(isToolAllowedForRole('admin', name)).toBe(true)
    expect(isToolAllowedForRole('teacher', name)).toBe(false)
    expect(isToolAllowedForRole('student', name)).toBe(false)
    expect(isToolAllowedForRole(undefined, name)).toBe(false)
  })

  it('the handler refuses a non-admin even if the guard were bypassed', async () => {
    const tools = registered()
    const res = await tools.get('lms_list_products')!.handler(listProductsInput.parse({}), ctxFor('teacher'))
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/admins only/)
  })
})

describe('commerce input schemas', () => {
  it('defaults the payment queue to open requests, 20 per page', () => {
    expect(listPaymentRequestsInput.parse({})).toEqual({ status: 'open', limit: 20, offset: 0 })
  })

  it('accepts the seeded (non-RFC-variant) tenant/user ids', () => {
    expect(listTransactionsInput.parse({ user_id: TENANT }).user_id).toBe(TENANT)
  })

  it('rejects bad pagination, statuses, ids and dates', () => {
    expect(listPaymentRequestsInput.safeParse({ limit: 0 }).success).toBe(false)
    expect(listPaymentRequestsInput.safeParse({ limit: 101 }).success).toBe(false)
    expect(listPaymentRequestsInput.safeParse({ status: 'paid' }).success).toBe(false)
    expect(listTransactionsInput.safeParse({ status: 'succeeded' }).success).toBe(false)
    expect(listTransactionsInput.safeParse({ user_id: 'abc' }).success).toBe(false)
    expect(listTransactionsInput.safeParse({ from: 'yesterday' }).success).toBe(false)
    expect(listSubscriptionsInput.safeParse({ status: 'live' }).success).toBe(true)
    expect(confirmPaymentInput.safeParse({ request_id: 0 }).success).toBe(false)
    expect(confirmPaymentInput.safeParse({ request_id: 1, admin_notes: 'x'.repeat(2001) }).success).toBe(false)
  })
})

describe('paymentRequestTransitionError', () => {
  it('confirms only pending/contacted; already-confirmed is an idempotent no-op', () => {
    expect(paymentRequestTransitionError('confirm', 'pending')).toBeNull()
    expect(paymentRequestTransitionError('confirm', 'contacted')).toBeNull()
    expect(paymentRequestTransitionError('confirm', 'payment_received')).toBeNull()
    expect(paymentRequestTransitionError('confirm', 'completed')).toMatch(/only a pending or contacted/)
    expect(paymentRequestTransitionError('confirm', 'cancelled')).toMatch(/only a pending or contacted/)
  })

  it('never rejects a completed request', () => {
    expect(paymentRequestTransitionError('reject', 'payment_received')).toBeNull()
    expect(paymentRequestTransitionError('reject', 'cancelled')).toBeNull()
    expect(paymentRequestTransitionError('reject', 'completed')).toMatch(/already granted access/)
  })
})

describe('confirm / reject handlers', () => {
  beforeEach(() => {
    fake.calls.length = 0
    fake.results.clear()
  })

  const request = (status: string) => ({
    data: { request_id: 7, status, user_id: STUDENT, product: { name: 'Course A' }, plan: null },
    error: null,
  })

  it('moves a contacted request to payment_received, guarded by tenant and status', async () => {
    fake.results.set('payment_requests:select', [request('contacted')])
    fake.results.set('payment_requests:update', [{ data: [{ request_id: 7 }], error: null }])
    fake.results.set('notifications:insert', [{ data: { id: 99 }, error: null }])
    fake.results.set('user_notifications:insert', [{ data: null, error: null }])

    const res = await registered()
      .get('lms_confirm_payment_received')!
      .handler(confirmPaymentInput.parse({ request_id: 7, admin_notes: 'ref 123' }), ctxFor('admin'))

    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({ status: 'payment_received', changed: true, student_notified: true })
    const update = fake.calls.find((c) => c.table === 'payment_requests' && c.op === 'update')!
    expect(update.args[0]).toMatchObject({ status: 'payment_received', admin_notes: 'ref 123', processed_by: ADMIN })
    const filters = fake.calls.filter((c) => c.table === 'payment_requests' && c.op === 'eq').map((c) => c.args)
    expect(filters).toContainEqual(['tenant_id', TENANT])
    expect(filters).toContainEqual(['status', 'contacted'])
    // Never a sale: the MCP does not write transactions.
    expect(fake.calls.some((c) => c.table === 'transactions')).toBe(false)
  })

  it('refuses to confirm a completed request without writing', async () => {
    fake.results.set('payment_requests:select', [request('completed')])
    const res = await registered()
      .get('lms_confirm_payment_received')!
      .handler(confirmPaymentInput.parse({ request_id: 7 }), ctxFor('admin'))
    expect(res.isError).toBe(true)
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('reports a lost race (no row updated) as an error', async () => {
    fake.results.set('payment_requests:select', [request('pending')])
    fake.results.set('payment_requests:update', [{ data: [], error: null }])
    const res = await registered()
      .get('lms_confirm_payment_received')!
      .handler(confirmPaymentInput.parse({ request_id: 7 }), ctxFor('admin'))
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/changed while confirming/)
  })

  it('rejecting a paid request cancels it and says to refund offline', async () => {
    fake.results.set('payment_requests:select', [request('payment_received')])
    fake.results.set('payment_requests:update', [{ data: [{ request_id: 7 }], error: null }])
    const res = await registered()
      .get('lms_reject_payment_request')!
      .handler({ request_id: 7, reason: 'wrong amount' }, ctxFor('admin'))
    expect(res.structuredContent).toMatchObject({ status: 'cancelled', changed: true })
    expect(String(res.structuredContent!.next_step)).toMatch(/refund/)
  })
})

describe('fetchAllPages', () => {
  it('pages until a short page and returns every row', async () => {
    const all = Array.from({ length: 5 }, (_, i) => ({ i }))
    const rows = await fetchAllPages('rows', (from, to) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null, count: all.length }), 2)
    expect(rows).toHaveLength(5)
  })

  it('refuses a partial read rather than report a short total', async () => {
    await expect(
      fetchAllPages('rows', () => Promise.resolve({ data: [{ i: 1 }], error: null, count: 3 }), 2)
    ).rejects.toThrow(/refusing to report a partial total/)
  })
})

describe('money arithmetic parity with lib/payments', () => {
  it('provider sets match PROVIDER_CAPABILITIES', () => {
    const providers = Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]
    expect([...FEE_BEARING_PROVIDERS].sort()).toEqual(providers.filter((p) => PROVIDER_CAPABILITIES[p].bearsPlatformFee).sort())
    expect([...FEE_BEARING_PROVIDERS].sort()).toEqual([...APP_FEE_BEARING].sort())
    expect([...PLATFORM_SETTLED_PROVIDERS].sort()).toEqual(
      providers.filter((p) => PROVIDER_CAPABILITIES[p].settlesToPlatformAccount).sort()
    )
  })

  const rows: RevenueRow[] = [
    // A .99 price at 80% — the #547 rounding case.
    { amount: 49.99, currency: 'usd', paymentProvider: 'paypal', schoolPercentageSnapshot: 80 },
    // Partial refund stays successful; only the slice leaves.
    { amount: 100, refundedAmount: 10, currency: 'usd', paymentProvider: 'lemonsqueezy', schoolPercentageSnapshot: 90 },
    // Pre-snapshot row falls back to the tenant split.
    { amount: 20, currency: 'usd', paymentProvider: 'binance', schoolPercentageSnapshot: null },
    // Direct-to-school rails: fee on stripe, none on manual; neither is owed.
    { amount: 30, currency: 'usd', paymentProvider: 'stripe', schoolPercentageSnapshot: 80 },
    { amount: 15, currency: 'usd', paymentProvider: 'manual', schoolPercentageSnapshot: 80 },
    // Legacy rows: Stripe intent → stripe; nothing → manual.
    { amount: 12.5, currency: 'usd', paymentProvider: null, stripePaymentIntentId: 'pi_1', schoolPercentageSnapshot: null },
    { amount: 7, currency: 'usd', paymentProvider: null, schoolPercentageSnapshot: null },
    // Second currency never mixes.
    { amount: 33.33, currency: 'eur', paymentProvider: 'paypal', schoolPercentageSnapshot: 70 },
  ]
  const payouts = [
    { amount: 30, currency: 'usd' },
    { amount: 50, currency: 'eur' },
  ]
  const fallback = 75

  it('owed / already paid / overpaid match computeOwedBalances per currency', () => {
    const mine = computeSchoolRevenue(rows, payouts, fallback)
    const [app] = computeOwedBalances(
      [{ tenantId: 't', tenantName: 'T', schoolPercentage: fallback }],
      rows
        .filter((r) => r.paymentProvider && PLATFORM_SETTLED_PROVIDERS.has(r.paymentProvider))
        .map((r) => ({
          tenantId: 't',
          paymentProvider: r.paymentProvider!,
          amount: r.amount,
          refundedAmount: r.refundedAmount ?? null,
          currency: r.currency ?? 'usd',
          schoolPercentageSnapshot: r.schoolPercentageSnapshot ?? null,
          status: 'successful' as const,
          transactionDate: null,
        })),
      payouts.map((p) => ({ tenantId: 't', amount: p.amount, currency: p.currency, coveredThrough: null }))
    )
    for (const balance of app.balances) {
      const c = mine.find((m) => m.currency === balance.currency)!
      expect(c.platform_collected).toBe(balance.grossCollected)
      expect(c.owed_gross).toBe(balance.grossOwed)
      expect(c.already_paid).toBe(balance.alreadyPaid)
      expect(c.net_owed).toBe(balance.netOwed)
      expect(c.overpaid).toBe(balance.overpaid)
    }
    // EUR: 33.33 × 70% = 23.33 owed, 50 paid → overpaid 26.67, owes nothing.
    expect(mine.find((m) => m.currency === 'eur')).toMatchObject({ net_owed: 0, overpaid: 26.67 })
  })

  it('gross / fees / school revenue match computeRevenueTotals per currency', () => {
    const mine = computeSchoolRevenue(rows, [], fallback)
    for (const currency of ['usd', 'eur']) {
      const app = computeRevenueTotals(
        rows
          .filter((r) => r.currency === currency)
          .map((r) => ({
            amount: r.amount,
            refundedAmount: r.refundedAmount ?? null,
            paymentProvider: r.paymentProvider ?? null,
            stripePaymentIntentId: r.stripePaymentIntentId ?? null,
            schoolPercentageSnapshot: r.schoolPercentageSnapshot ?? null,
          })),
        fallback
      )
      const c = mine.find((m) => m.currency === currency)!
      expect(c.gross_revenue).toBe(app.grossRevenue)
      expect(c.platform_fees).toBe(app.platformFees)
      expect(c.school_revenue).toBe(app.netRevenue)
    }
  })
})
