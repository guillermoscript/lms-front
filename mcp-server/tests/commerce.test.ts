/**
 * Commerce tools (#897): role gating, input schemas, the payment-request
 * transitions, and parity of the mirrored money arithmetic with the app's own
 * `lib/payments` modules (the MCP image cannot import them, so this is the
 * drift guard).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'

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
    createUserClient: () => ({
      from: (t: string) => builder(t),
      rpc: (name: string) => {
        const queue = fake.results.get(`rpc:${name}`) ?? []
        return Promise.resolve(queue.length ? queue.shift() : { data: null, error: null })
      },
    }),
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
  fetchAllPages,
} from '../src/tools/commerce.js'
import {
  FEE_BEARING_PROVIDERS,
  PLATFORM_SETTLED_PROVIDERS,
  computeSchoolRevenue,
  paymentRequestTransitionError,
  type RevenueRow,
  FEE_LEDGER_PROVIDERS,
  FEE_DUE_DAYS,
  computeFeeBalances,
  feeForTxn,
  feeStatementStatus,
  latestFeeDueBoundary,
  overdueFeeBalances,
  summarizeConvertedSales,
  type FeeLedgerTxn,
} from '../src/commerce-math.js'
// The app's own modules. The fee-ledger ones import through the root `@/`
// alias, which mcp-server/vitest.config.ts maps for tests only.
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '../../lib/payments/types'
import { computeOwedBalances } from '../../lib/payments/payouts-owed'
import { computeRevenueTotals, FEE_BEARING_PROVIDERS as APP_FEE_BEARING } from '../../lib/payments/revenue-share'
import * as appFee from '../../lib/payments/platform-fee-owed'
import { summarizeConvertedSales as appSummarizeConverted } from '../../lib/billing/platform-fee-view'
import { statementStatus as appStatementStatus } from '../../lib/billing/platform-fee-statement'

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

/**
 * Run a tool and assert its structuredContent parses against its outputSchema —
 * mcp-use `validateToolOutput` throws a ProtocolError at runtime on a mismatch
 * (e.g. a NULL column where the schema says z.string()), which typecheck can't see.
 */
async function call(name: string, input: unknown, role = 'admin') {
  const tool = registered().get(name)!
  const res = await tool.handler(input, ctxFor(role))
  if (!res.isError) {
    const parsed = (tool.def.outputSchema as z.ZodType).safeParse(res.structuredContent)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(parsed.success).toBe(true)
  }
  return res
}

/** The eq filters chained AFTER the first UPDATE on `table` (not the earlier SELECT's). */
function updateFilters(table: string) {
  const i = fake.calls.findIndex((c) => c.table === table && c.op === 'update')
  expect(i).toBeGreaterThanOrEqual(0)
  return fake.calls.slice(i).filter((c) => c.table === table && c.op === 'eq').map((c) => c.args)
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
    const res = await tools.get('lms_list_transactions')!.handler(listTransactionsInput.parse({}), ctxFor('teacher'))
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

    const res = await call('lms_confirm_payment_received', confirmPaymentInput.parse({ request_id: 7, admin_notes: 'ref 123' }))

    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({ status: 'payment_received', changed: true, student_notified: true })
    const update = fake.calls.find((c) => c.table === 'payment_requests' && c.op === 'update')!
    expect(update.args[0]).toMatchObject({ status: 'payment_received', admin_notes: 'ref 123', processed_by: ADMIN })
    // Only the UPDATE's own filters — the SELECT before it also filters tenant_id.
    const filters = updateFilters('payment_requests')
    expect(filters).toContainEqual(['request_id', 7])
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
    const res = await call('lms_reject_payment_request', { request_id: 7, reason: 'wrong amount' })
    expect(res.structuredContent).toMatchObject({ status: 'cancelled', changed: true })
    expect(String(res.structuredContent!.next_step)).toMatch(/refund/)

    const update = fake.calls.find((c) => c.table === 'payment_requests' && c.op === 'update')!
    expect(update.args[0]).toMatchObject({ status: 'cancelled', admin_notes: 'wrong amount', processed_by: ADMIN })
    const filters = updateFilters('payment_requests')
    expect(filters).toContainEqual(['request_id', 7])
    expect(filters).toContainEqual(['tenant_id', TENANT])
    expect(filters).toContainEqual(['status', 'payment_received'])
    expect(fake.calls.some((c) => c.table === 'transactions')).toBe(false)
  })

  it('rejecting an already-cancelled request is a no-op', async () => {
    fake.results.set('payment_requests:select', [request('cancelled')])
    const res = await call('lms_reject_payment_request', { request_id: 7 })
    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({ status: 'cancelled', changed: false, student_notified: false })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })
})

describe('read handlers return outputSchema-valid payloads', () => {
  beforeEach(() => {
    fake.calls.length = 0
    fake.results.clear()
  })

  it('lms_list_payment_requests: embeds and nullable fields', async () => {
    fake.results.set('payment_requests:select', [{
      data: [{
        request_id: 7, status: 'pending', user_id: STUDENT, contact_name: null, contact_email: null,
        product_id: null, plan_id: 3, payment_amount: '20.00', payment_currency: null, payment_method: null,
        payment_reference: null, reported_amount: null, reported_currency: null, payment_reported_at: null,
        payment_confirmed_at: null, created_at: null, expires_at: null, admin_notes: null,
        product: null, plan: [{ plan_name: 'All access' }],
      }],
      error: null,
      count: 1,
    }])
    const res = await call('lms_list_payment_requests', listPaymentRequestsInput.parse({}))
    expect(res.structuredContent).toMatchObject({ requests: [{ request_id: 7, item: 'All access', amount: 20 }] })
  })

  it('lms_list_transactions: net of refunds, page totals over successful rows only', async () => {
    fake.results.set('transactions:select', [{
      data: [
        { transaction_id: 2, transaction_date: '2026-09-02T00:00:00Z', user_id: STUDENT, product_id: 1, plan_id: null, amount: '100', refunded_amount: '10', currency: 'usd', status: 'successful', payment_provider: 'paypal' },
        { transaction_id: 1, transaction_date: '2026-09-01T00:00:00Z', user_id: STUDENT, product_id: null, plan_id: 3, amount: '9', refunded_amount: null, currency: null, status: 'pending', payment_provider: null },
      ],
      error: null,
      count: 2,
    }])
    fake.results.set('profiles:select', [{ data: [{ id: STUDENT, full_name: null }], error: null }])
    fake.results.set('products:select', [{ data: [{ product_id: 1, name: 'Solo' }], error: null }])
    fake.results.set('plans:select', [{ data: [{ plan_id: 3, plan_name: 'All access' }], error: null }])
    const res = await call('lms_list_transactions', listTransactionsInput.parse({}))
    expect(res.structuredContent).toMatchObject({
      transactions: [
        { transaction_id: 2, item: 'Solo', net_amount: 90, student_name: null },
        { transaction_id: 1, item: 'All access', refunded_amount: 0, currency: null },
      ],
      page_totals: [{ currency: 'usd', successful_net: 90, count: 1 }],
    })
  })

  it('lms_list_subscriptions: live flag and nullable periods', async () => {
    fake.results.set('subscriptions:select', [{
      data: [{
        subscription_id: 5, user_id: STUDENT, plan_id: 3, subscription_status: 'past_due', payment_provider: null,
        current_period_start: null, current_period_end: null, cancel_at_period_end: null, cancel_at: null,
        canceled_at: null, created: null, profiles: null, plans: { plan_name: 'All access' },
      }],
      error: null,
      count: 1,
    }])
    const res = await call('lms_list_subscriptions', listSubscriptionsInput.parse({}))
    expect(res.structuredContent).toMatchObject({
      subscriptions: [{ subscription_id: 5, live: true, cancel_at_period_end: false, plan_name: 'All access' }],
    })
  })

  it('lms_get_payouts_owed: null currency / paid_at, no split row → default', async () => {
    fake.results.set('revenue_splits:select', [{ data: null, error: null }])
    fake.results.set('transactions:select', [{
      data: [{ amount: '50', refunded_amount: null, currency: 'usd', payment_provider: 'paypal', stripe_payment_intent_id: null, school_percentage_snapshot: '80' }],
      error: null,
      count: 1,
    }])
    // One payout row shaped for both reads (the paged sum and the recent list).
    const payout = {
      data: [{ payout_id: 1, amount: '10', currency: null, status: 'pending', payout_method: null, period_start: null, period_end: null, paid_at: null, created_at: null }],
      error: null,
      count: 1,
    }
    fake.results.set('payouts:select', [payout, payout])
    const res = await call('lms_get_payouts_owed', {})
    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({
      recent_payouts: [{ payout_id: 1, currency: null, paid_at: null }],
    })
  })

  it('lms_get_billing_status: no subscription period end, empty RPCs', async () => {
    fake.results.set('tenants:select', [{
      data: { name: 'Default School', plan: null, billing_status: null, billing_period_end: null, access_cutoff_at: null },
      error: null,
    }])
    fake.results.set('platform_subscriptions:select', [{
      data: {
        status: 'active', payment_provider: 'solana', interval: 'monthly', cancel_at_period_end: null,
        current_period_start: null, current_period_end: null, grace_period_end: null,
      },
      error: null,
    }])
    fake.results.set('platform_payment_requests:select', [{
      data: [{ request_id: 'abc', status: 'pending', amount: null, currency: null, interval: null, payment_provider: null, created_at: null, expires_at: null, platform_plans: null }],
      error: null,
    }])
    // get_plan_features / get_tenant_plan_usage resolve empty (default).
    const res = await call('lms_get_billing_status', {})
    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({
      plan: 'free',
      billing_status: 'free',
      plan_name: null,
      transaction_fee_percent: null,
      usage: null,
      subscription: { current_period_end: null, cancel_at_period_end: false },
    })
  })
})

describe('lms_get_platform_fee_balance', () => {
  beforeEach(() => {
    fake.calls.length = 0
    fake.results.clear()
    vi.useFakeTimers({ toFake: ['Date'] })
    // Past the 4 Oct boundary: September's fees are due, October's are not.
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('accrued / paid / overdue per ledger currency, statements, standing and payments', async () => {
    fake.results.set('revenue_splits:select', [{ data: null, error: null }])
    fake.results.set('transactions:select', [{
      data: [
        // Sept, 80% → fee 20 (overdue part).
        { transaction_id: 1, payment_provider: 'manual', amount: '100', refunded_amount: null, currency: 'usd', school_percentage_snapshot: '80', status: 'successful', transaction_date: '2026-09-15T10:00:00Z', usd_amount: null, fx_rate_to_usd: null, fx_rate_source: null },
        // Oct, partial refund: kept 40 at 90% → fee 4 (not yet due).
        { transaction_id: 2, payment_provider: 'manual', amount: '50', refunded_amount: '10', currency: 'usd', school_percentage_snapshot: '90', status: 'successful', transaction_date: '2026-10-05T10:00:00Z', usd_amount: null, fx_rate_to_usd: null, fx_rate_source: null },
        // Sept VES with its frozen USD snapshot → USD bucket: 27.30 × 20% = 5.46.
        { transaction_id: 3, payment_provider: 'binance_personal', amount: '1000', refunded_amount: null, currency: 'ves', school_percentage_snapshot: null, status: 'successful', transaction_date: '2026-09-20T10:00:00Z', usd_amount: '27.30', fx_rate_to_usd: '0.0273', fx_rate_source: 'bcv' },
      ],
      error: null,
      count: 3,
    }])
    // One shape for both reads (the paged succeeded sum and the recent list).
    const payments = {
      data: [
        { payment_id: 'p2', amount: '5', currency: 'USD', provider: 'stripe', status: 'pending', review_reason: 'amount/currency mismatch', paid_at: null, created_at: '2026-10-06T00:00:00Z' },
        { payment_id: 'p1', amount: '10', currency: 'USD', provider: 'manual', status: 'succeeded', review_reason: null, paid_at: '2026-10-02T00:00:00Z', created_at: '2026-10-01T00:00:00Z' },
      ],
      error: null,
      count: 2,
    }
    fake.results.set('platform_fee_payments:select', [payments, payments])
    fake.results.set('tenant_fee_standing:select', [{
      data: { state: 'overdue', overdue_since: '2026-10-04T00:00:00Z', blocked_at: null, enforcement_exempt: false, last_evaluated_at: null },
      error: null,
    }])
    fake.results.set('platform_fee_statements:select', [{
      data: [{ statement_number: 'PF-202609-1', currency: 'USD', period_start: '2026-09-01', period_end: '2026-09-30', due_at: '2026-10-04T00:00:00Z', fee_amount: '25.46', txn_count: 2 }],
      error: null,
    }])

    const res = await call('lms_get_platform_fee_balance', {})
    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({
      school_percentage: 80,
      due_boundary: { accrued_before: '2026-10-01T00:00:00.000Z', due_at: '2026-10-04T00:00:00.000Z' },
      // 20 + 4 + 5.46 accrued, 10 paid (the pending payment does not count).
      balances: [{ currency: 'USD', accrued: 29.46, paid: 10, net_owed: 19.46, overdue: 15.46, overpaid: 0, sales: 3 }],
      standing: { state: 'overdue', blocked_at: null, enforcement_exempt: false },
      converted_sales: [{ currency: 'VES', count: 1, sales_total: 1000, usd_total: 27.3, rates: [{ rate: 0.0273, source: 'bcv' }] }],
      statements: [{ statement_number: 'PF-202609-1', fee_amount: 25.46, sales: 2, status: 'overdue' }],
      recent_payments: [
        { payment_id: 'p2', counts_toward_balance: false, under_review: true },
        { payment_id: 'p1', counts_toward_balance: true, under_review: false },
      ],
    })
    expect(res.content[0].text).toMatch(/15\.46 overdue/)
    expect(res.content[0].text).toMatch(/Pay now/)

    // Every read is tenant-scoped explicitly, and only the school-collected rails accrue.
    for (const table of ['transactions', 'platform_fee_payments', 'tenant_fee_standing', 'platform_fee_statements', 'revenue_splits']) {
      expect(fake.calls.some((c) => c.table === table && c.op === 'eq' && c.args[0] === 'tenant_id' && c.args[1] === TENANT), table).toBe(true)
    }
    expect(fake.calls.find((c) => c.table === 'transactions' && c.op === 'in')?.args).toEqual(['payment_provider', ['manual', 'binance_personal']])
    expect(fake.calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
  })

  it('a school with no fee history is ok with nothing owed', async () => {
    const res = await call('lms_get_platform_fee_balance', {})
    expect(res.isError).toBeUndefined()
    expect(res.structuredContent).toMatchObject({
      balances: [],
      standing: { state: 'ok', overdue_since: null, blocked_at: null, enforcement_exempt: false },
      statements: [],
      recent_payments: [],
      converted_sales: [],
    })
    expect(res.content[0].text).not.toMatch(/Pay now/)
  })

  it('a read error surfaces instead of a wrong balance', async () => {
    fake.results.set('platform_fee_statements:select', [{ data: null, error: { message: 'boom' } }])
    const res = await call('lms_get_platform_fee_balance', {})
    expect(res.isError).toBe(true)
    expect(res.content[0].text).toMatch(/fee statements: boom/)
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

describe('platform fee arithmetic parity with lib/payments/platform-fee-owed (#929)', () => {
  it('fee-ledger rails match PROVIDER_CAPABILITIES (bearsPlatformFee: false)', () => {
    expect([...FEE_LEDGER_PROVIDERS].sort()).toEqual([...appFee.FEE_LEDGER_PROVIDERS].sort())
    expect(FEE_DUE_DAYS).toBe(appFee.FEE_DUE_DAYS)
    expect(appFee.DEFAULT_HYPERINFLATION_CURRENCIES).toEqual(['VES'])
  })

  const fx = (usd: number, rate: number) => ({ usdAmount: usd, fxRateToUsd: rate, fxRateSource: 'bcv' })
  const txns: FeeLedgerTxn[] = [
    // .99 at 80%: the #547 per-row rounding case.
    { paymentProvider: 'manual', amount: 49.99, refundedAmount: null, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-08-03T09:00:00Z' },
    // Partial refund, other split.
    { paymentProvider: 'binance_personal', amount: 100, refundedAmount: 33.33, currency: 'USD', schoolPercentageSnapshot: 85, status: 'successful', transactionDate: '2026-09-30T23:59:59Z' },
    // Legacy NULL snapshot → fallback split; NULL currency → USD.
    { paymentProvider: 'manual', amount: 12.5, refundedAmount: null, currency: null, schoolPercentageSnapshot: null, status: 'successful', transactionDate: '2026-10-01T00:00:00Z' },
    // Refunded to zero, fully refunded, pending, free: no fee.
    { paymentProvider: 'manual', amount: 20, refundedAmount: 20, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-09-02T00:00:00Z' },
    { paymentProvider: 'manual', amount: 20, refundedAmount: 20, currency: 'usd', schoolPercentageSnapshot: 80, status: 'refunded', transactionDate: '2026-09-02T00:00:00Z' },
    { paymentProvider: 'manual', amount: 20, refundedAmount: null, currency: 'usd', schoolPercentageSnapshot: 80, status: 'pending', transactionDate: '2026-09-02T00:00:00Z' },
    { paymentProvider: 'manual', amount: 0, refundedAmount: null, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-09-02T00:00:00Z' },
    // Fee-bearing rails never accrue a debt.
    { paymentProvider: 'stripe', amount: 30, refundedAmount: null, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-09-02T00:00:00Z' },
    { paymentProvider: 'paypal', amount: 30, refundedAmount: null, currency: 'usd', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-09-02T00:00:00Z' },
    // VES with its frozen snapshot → USD; a partial refund converts at the stored rate.
    { paymentProvider: 'manual', amount: 3650, refundedAmount: null, currency: 'ves', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-09-10T00:00:00Z', ...fx(100.01, 0.0274) },
    { paymentProvider: 'binance_personal', amount: 1000, refundedAmount: 250, currency: 'VES', schoolPercentageSnapshot: 75, status: 'successful', transactionDate: '2026-10-07T00:00:00Z', ...fx(27.33, 0.02733) },
    { paymentProvider: 'manual', amount: 500, refundedAmount: null, currency: 'ves', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-10-08T00:00:00Z', ...fx(13.67, 0.0274) },
    // VES with no snapshot stays in its own bucket.
    { paymentProvider: 'manual', amount: 800, refundedAmount: null, currency: 'ves', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-08-20T00:00:00Z' },
    // A second currency never mixes.
    { paymentProvider: 'manual', amount: 33.33, refundedAmount: null, currency: 'eur', schoolPercentageSnapshot: 70, status: 'successful', transactionDate: '2026-07-15T00:00:00Z' },
  ]
  const payments = [
    { amount: 5, currency: 'USD', status: 'succeeded' },
    { amount: 3.21, currency: 'USD', status: 'succeeded' },
    { amount: 99, currency: 'USD', status: 'reversed' },
    { amount: 99, currency: 'USD', status: 'pending' },
    { amount: 99, currency: 'USD', status: 'failed' },
    // EUR overpaid → carried forward as credit.
    { amount: 20, currency: 'EUR', status: 'succeeded' },
  ]
  const fallback = 75
  const appOpts = { fallbackSchoolPercentage: fallback, hyperinflationCurrencies: appFee.DEFAULT_HYPERINFLATION_CURRENCIES }
  // The MCP cannot read platform_fee_config: it converts on the snapshot alone.
  const mcpOpts = { fallbackSchoolPercentage: fallback }

  const asMine = (b: appFee.FeeBalance) => ({
    currency: b.currency, accrued: b.accrued, paid: b.paid, net_owed: b.netOwed, overpaid: b.overpaid, sales: b.sales,
  })

  it('per-row fee lines match feeForTxn', () => {
    for (const t of txns) {
      const app = appFee.feeForTxn({ ...t, paymentProvider: t.paymentProvider ?? '' }, appOpts)
      expect(feeForTxn(t, mcpOpts), JSON.stringify(t)).toEqual(app)
    }
  })

  it('accrued / paid / balance / overpaid match computeFeeBalances, all time and before a cutoff', () => {
    const appTxns = txns.map((t) => ({ ...t, paymentProvider: t.paymentProvider ?? '' }))
    const all = appFee.computeFeeBalances(appTxns, payments, appOpts)
    expect(computeFeeBalances(txns, payments, mcpOpts)).toEqual(all.map(asMine))
    expect(all.map((b) => b.currency)).toEqual(['EUR', 'USD', 'VES'])
    expect(all.find((b) => b.currency === 'EUR')).toMatchObject({ netOwed: 0, overpaid: 10 })

    for (const cutoff of ['2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z', '2026-10-08T00:00:00Z']) {
      const accruedBefore = Date.parse(cutoff)
      expect(computeFeeBalances(txns, payments, { ...mcpOpts, accruedBefore }), cutoff).toEqual(
        appFee.computeFeeBalances(appTxns, payments, { ...appOpts, accruedBefore }).map(asMine)
      )
    }
  })

  it('due boundary and overdue match latestFeeDueBoundary / overdueFeeBalances', () => {
    const appTxns = txns.map((t) => ({ ...t, paymentProvider: t.paymentProvider ?? '' }))
    for (const at of [
      '2026-10-04T00:00:00Z', // exactly on the due instant: not yet past
      '2026-10-04T00:00:00.001Z',
      '2026-10-09T12:00:00Z',
      '2026-01-02T00:00:00Z', // year wrap
      '2026-03-31T23:59:59Z',
    ]) {
      const now = new Date(at)
      expect(latestFeeDueBoundary(now), at).toEqual(appFee.latestFeeDueBoundary(now))
      expect(overdueFeeBalances(txns, payments, now, mcpOpts), at).toEqual(
        appFee.overdueFeeBalances(appTxns, payments, now, appOpts).map(({ currency, overdue }) => ({ currency, overdue }))
      )
    }
  })

  it('statement status matches statementStatus', () => {
    const now = new Date('2026-10-09T12:00:00Z')
    for (const [owed, due] of [[0, '2026-10-04T00:00:00Z'], [0.004, '2026-10-04T00:00:00Z'], [12, '2026-10-04T00:00:00Z'], [12, '2026-11-04T00:00:00Z']] as const) {
      expect(feeStatementStatus(owed, due, now)).toBe(appStatementStatus(owed, due, now))
    }
  })

  it('converted sales match summarizeConvertedSales', () => {
    const appTxns = txns.map((t) => ({ ...t, paymentProvider: t.paymentProvider ?? '' }))
    const app = appSummarizeConverted(appTxns, appOpts)
    expect(summarizeConvertedSales(txns, mcpOpts)).toEqual(
      app.map((l) => ({ currency: l.currency, count: l.count, sales_total: l.salesTotal, usd_total: l.usdTotal, rates: l.rates }))
    )
    expect(app).toHaveLength(1)
  })

  it('documented approximation: only a currency REMOVED from the config list after sales were stamped diverges', () => {
    const appTxns = txns.map((t) => ({ ...t, paymentProvider: t.paymentProvider ?? '' }))
    const removed = { fallbackSchoolPercentage: fallback, hyperinflationCurrencies: [] as string[] }
    // The ledger moves stamped VES sales back to VES; the snapshot-only view keeps them in USD…
    expect(computeFeeBalances(txns, payments, mcpOpts)).not.toEqual(appFee.computeFeeBalances(appTxns, payments, removed).map(asMine))
    // …and given the list, the mirror is exact again.
    expect(computeFeeBalances(txns, payments, removed)).toEqual(appFee.computeFeeBalances(appTxns, payments, removed).map(asMine))
  })
})
