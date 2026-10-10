import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeeCheckoutCloseOutcome, FeeCheckoutRow } from '@/lib/billing/platform-fee-checkout-close'

/**
 * The stale platform-fee payment sweep (#951).
 *
 * A hosted fee checkout the school walked away from left its
 * `platform_fee_payments` row `pending` forever: only the manual and Solana
 * rails have a request row whose expiry cancels it. The sweep closes that gap,
 * and the cases worth pinning are the ones where cancelling is WRONG — a row a
 * payment request owns (`payment_received` above all), one the provider says
 * is paid, one the provider would not answer for, one a webhook settled while
 * the pass was running.
 *
 * Same in-memory-store fake as expire-stale-checkouts.test.ts, because the
 * guarded UPDATE has to be evaluated against the row as it is at write time.
 */

type Row = Record<string, unknown>

const db: Record<string, Row[]> = { platform_fee_payments: [], platform_payment_requests: [], transactions: [] }
const failing: { read: string | null; update: string | null } = { read: null, update: null }
const inListSizes: number[] = []

function makeSupabase() {
  function builder(table: string) {
    const preds: ((row: Row) => boolean)[] = []
    const orders: [string, boolean][] = []
    let window: [number, number] | null = null
    let take = Infinity
    let headCount = false
    let patch: Row | null = null

    const matched = () => (db[table] || []).filter((r) => preds.every((p) => p(r)))

    function settle() {
      if (patch) {
        if (failing.update === table) return { data: null, error: { code: 'XX000', message: 'update failed' } }
        const changed = matched()
        for (const r of changed) Object.assign(r, patch)
        return { data: changed.map((r) => ({ ...r })), error: null }
      }
      if (failing.read === table) return { data: null, count: null, error: { code: 'XX000', message: 'read failed' } }
      let rows = matched()
      if (headCount) return { data: null, count: rows.length, error: null }
      for (const [col, ascending] of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (ascending ? 1 : -1))
      }
      if (window) rows = rows.slice(window[0], window[1] + 1)
      if (take !== Infinity) rows = rows.slice(0, take)
      return { data: rows.map((r) => ({ ...r })), error: null }
    }

    const b: Record<string, unknown> = {
      select(_cols?: string, opts?: { head?: boolean }) {
        if (opts?.head) headCount = true
        return b
      },
      update(values: Row) {
        patch = values
        return b
      },
      eq(col: string, val: unknown) {
        preds.push((r) => r[col] === val)
        return b
      },
      is(col: string, val: unknown) {
        if (val !== null) throw new Error('fake: only is(col, null)')
        preds.push((r) => r[col] == null)
        return b
      },
      not(col: string, op: string, val: unknown) {
        if (op !== 'is' || val !== null) throw new Error('fake: only not(col, is, null)')
        preds.push((r) => r[col] != null)
        return b
      },
      in(col: string, vals: unknown[]) {
        inListSizes.push(vals.length)
        preds.push((r) => vals.includes(r[col]))
        return b
      },
      lt(col: string, val: string) {
        preds.push((r) => r[col] != null && new Date(r[col] as string) < new Date(val))
        return b
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orders.push([col, opts?.ascending !== false])
        return b
      },
      range(from: number, to: number) {
        window = [from, to]
        return b
      },
      limit(n: number) {
        take = n
        return b
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settle()).then(resolve),
    }
    return b
  }
  return { from: (table: string) => builder(table) }
}

const h = vi.hoisted(() => ({
  close: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeSupabase() }))
vi.mock('@/lib/analytics/server', () => ({ track: () => Promise.resolve() }))
vi.mock('@/lib/payments/webhook-dispatch', () => ({ dispatchBillingEvent: () => Promise.resolve() }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => {
    throw new Error('stripe must not be reached')
  },
}))
vi.mock('@/lib/billing/platform-fee-checkout-close', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-fee-checkout-close')>()
  // The route test swaps the closer in; everything else gets the real one.
  return {
    ...actual,
    closeFeeCheckoutAtProvider: (admin: SupabaseClient, row: FeeCheckoutRow) =>
      h.close.getMockImplementation() ? h.close(admin, row) : actual.closeFeeCheckoutAtProvider(admin, row),
  }
})

import {
  expireStaleFeePayments,
  feePaymentTtlMinutes,
  isFeePaymentStale,
  FEE_PAYMENT_EXPIRY_BATCH_LIMIT,
  FEE_PAYMENT_TTL_MINUTES,
} from '@/lib/billing/platform-fee-payment-expiry'
import { GET } from '@/app/api/cron/expire-stale-checkouts/route'

const TENANT = '11111111-1111-1111-1111-111111111111'
const NOW = new Date('2026-10-10T12:00:00.000Z')
const HOUR = 60 * 60 * 1000
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * HOUR).toISOString()

const admin = () => makeSupabase() as unknown as SupabaseClient

let nextId = 1
function seedPayment(over: Row = {}): Row {
  const row: Row = {
    payment_id: `pay-${String(nextId++).padStart(4, '0')}`,
    tenant_id: TENANT,
    provider: 'stripe',
    provider_reference: 'cs_1',
    amount: 25,
    currency: 'USD',
    status: 'pending',
    review_reason: null,
    created_at: hoursAgo(25),
    updated_at: hoursAgo(25),
    ...over,
  }
  db.platform_fee_payments.push(row)
  return row
}

function seedRequest(payment: Row, status: string): Row {
  const request: Row = { request_id: `req-${nextId++}`, tenant_id: TENANT, fee_payment_id: payment.payment_id, status }
  db.platform_payment_requests.push(request)
  return request
}

/** A closer that answers per rail, and records what it was asked. */
function closer(answer: FeeCheckoutCloseOutcome | ((row: FeeCheckoutRow) => FeeCheckoutCloseOutcome | Promise<FeeCheckoutCloseOutcome>)) {
  return vi.fn(async (_admin: SupabaseClient, row: FeeCheckoutRow) => (typeof answer === 'function' ? answer(row) : answer))
}

beforeEach(() => {
  db.platform_fee_payments = []
  db.platform_payment_requests = []
  db.transactions = []
  failing.read = null
  failing.update = null
  inListSizes.length = 0
  nextId = 1
  h.close.mockReset()
  delete process.env.CHECKOUT_TTL_MINUTES
  for (const key of Object.keys(FEE_PAYMENT_TTL_MINUTES)) delete FEE_PAYMENT_TTL_MINUTES[key]
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  delete process.env.CHECKOUT_TTL_MINUTES
})

describe('fee payment TTL', () => {
  it('is the shared checkout TTL (24h), env-overridable', () => {
    expect(feePaymentTtlMinutes('stripe')).toBe(24 * 60)
    process.env.CHECKOUT_TTL_MINUTES = '90'
    expect(feePaymentTtlMinutes('paypal')).toBe(90)
  })

  it('a per-rail override wins for that rail only, and a nonsense one is ignored', () => {
    FEE_PAYMENT_TTL_MINUTES.binance = 48 * 60
    FEE_PAYMENT_TTL_MINUTES.paypal = -5
    expect(feePaymentTtlMinutes('binance')).toBe(48 * 60)
    expect(feePaymentTtlMinutes('paypal')).toBe(24 * 60)
    expect(isFeePaymentStale({ provider: 'binance', created_at: hoursAgo(30) }, NOW)).toBe(false)
    expect(isFeePaymentStale({ provider: 'stripe', created_at: hoursAgo(30) }, NOW)).toBe(true)
  })
})

describe('expireStaleFeePayments', () => {
  it('cancels a stale hosted row once its checkout is closed at the provider', async () => {
    const row = seedPayment({ amount: '25.00' })
    const close = closer('closed')
    const result = await expireStaleFeePayments(admin(), NOW, { close })

    expect(result).toEqual({ scanned: 1, skipped: 0, recovered: 0, waiting: 0, expired: 1 })
    // 'canceled', never 'failed': nothing failed, nobody paid.
    expect(row.status).toBe('canceled')
    expect(row.updated_at).toBe(NOW.toISOString())
    expect(close).toHaveBeenCalledTimes(1)
    expect(close.mock.calls[0][1]).toEqual({
      payment_id: row.payment_id,
      tenant_id: TENANT,
      provider: 'stripe',
      provider_reference: 'cs_1',
      amount: 25,
      currency: 'USD',
    })
  })

  // A rail that cannot be asked gets no better answer by waiting; a success
  // that still arrives is flagged for review by the settle function.
  it('cancels a row on a rail that cannot be closed (unsupported)', async () => {
    const row = seedPayment({ provider: 'binance', provider_reference: 'prepay-1' })
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('unsupported') })
    expect(result).toMatchObject({ expired: 1, recovered: 0, waiting: 0 })
    expect(row.status).toBe('canceled')
  })

  it('leaves a row whose TTL has not lapsed alone, without asking the provider', async () => {
    const row = seedPayment({ created_at: hoursAgo(23) })
    const close = closer('closed')
    const result = await expireStaleFeePayments(admin(), NOW, { close })
    expect(result).toEqual({ scanned: 0, skipped: 0, recovered: 0, waiting: 0, expired: 0 })
    expect(close).not.toHaveBeenCalled()
    expect(row.status).toBe('pending')
  })

  // settle_platform_fee_payment() credits only a pending row: cancelling here
  // would turn a real payment into a review flag.
  it('never cancels a row the provider says is paid', async () => {
    const row = seedPayment()
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('paid') })
    expect(result).toMatchObject({ recovered: 1, expired: 0, waiting: 0 })
    expect(row.status).toBe('pending')
  })

  it('never cancels a row the provider would not answer for, nor one whose close threw', async () => {
    const silent = seedPayment()
    const broken = seedPayment({ provider: 'paypal', provider_reference: 'ORDER-1' })
    const close = closer((row) => {
      if (row.provider === 'paypal') throw new Error('boom')
      return 'unknown'
    })
    const result = await expireStaleFeePayments(admin(), NOW, { close })
    expect(result).toMatchObject({ scanned: 2, waiting: 2, expired: 0 })
    expect(silent.status).toBe('pending')
    expect(broken.status).toBe('pending')
  })

  // The request's own lifecycle decides — and `payment_received` is money a
  // super admin has already seen arrive.
  it('never touches a row a payment request points at, in any status', async () => {
    const close = closer('closed')
    const rows = ['pending', 'instructions_sent', 'payment_received', 'confirmed', 'rejected', 'expired'].map((status) => {
      const row = seedPayment({ provider: 'manual', provider_reference: null })
      seedRequest(row, status)
      return row
    })
    const result = await expireStaleFeePayments(admin(), NOW, { close })
    expect(result).toEqual({ scanned: 6, skipped: 6, recovered: 0, waiting: 0, expired: 0 })
    expect(close).not.toHaveBeenCalled()
    expect(rows.every((row) => row.status === 'pending')).toBe(true)
  })

  // Data-driven, not a provider list: what protects a manual / Solana row is
  // its request. One whose request insert failed has none and is swept — with
  // the REAL closer, which needs no provider for a row that opened no checkout.
  it('sweeps an orphan manual or Solana row that has no request', async () => {
    const manual = seedPayment({ provider: 'manual', provider_reference: null })
    const solana = seedPayment({ provider: 'solana', provider_reference: null })
    const result = await expireStaleFeePayments(admin(), NOW)
    expect(result).toMatchObject({ scanned: 2, skipped: 0, expired: 2 })
    expect(manual.status).toBe('canceled')
    expect(solana.status).toBe('canceled')
  })

  // A mismatched payment already arrived on it: a super admin resolves that,
  // and the school's balance card counts the row until they do.
  it('never reads a row flagged for review', async () => {
    const row = seedPayment({ review_reason: 'amount/currency mismatch: expected 25 USD, provider reported 20 USD' })
    const close = closer('closed')
    const result = await expireStaleFeePayments(admin(), NOW, { close })
    expect(result.scanned).toBe(0)
    expect(close).not.toHaveBeenCalled()
    expect(row.status).toBe('pending')
  })

  it('only ever reads pending rows', async () => {
    const rows = ['succeeded', 'failed', 'canceled', 'reversed'].map((status) => seedPayment({ status }))
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('closed') })
    expect(result.scanned).toBe(0)
    expect(rows.map((row) => row.status)).toEqual(['succeeded', 'failed', 'canceled', 'reversed'])
  })

  // The guarded UPDATE is what makes the pass safe against its own slowness.
  it('lets a webhook that settled the row mid-pass win, and reports what the DB cancelled', async () => {
    const settled = seedPayment()
    const flagged = seedPayment({ provider: 'binance', provider_reference: 'prepay-1' })
    const abandoned = seedPayment({ provider: 'paypal', provider_reference: 'ORDER-1' })
    const close = closer((row) => {
      if (row.payment_id === settled.payment_id) settled.status = 'succeeded'
      if (row.payment_id === flagged.payment_id) flagged.review_reason = 'amount/currency mismatch'
      return row.provider === 'binance' ? 'unsupported' : 'closed'
    })
    const result = await expireStaleFeePayments(admin(), NOW, { close })
    expect(result).toMatchObject({ scanned: 3, expired: 1 })
    expect(settled.status).toBe('succeeded')
    expect(flagged.status).toBe('pending')
    expect(abandoned.status).toBe('canceled')
  })

  it('a cancel that cannot be written leaves the row for the next pass and keeps going', async () => {
    seedPayment()
    seedPayment()
    failing.update = 'platform_fee_payments'
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('closed') })
    expect(result).toMatchObject({ scanned: 2, waiting: 2, expired: 0 })
  })

  it('throws before closing anything when the ledger cannot be read', async () => {
    seedPayment()
    const close = closer('closed')
    failing.read = 'platform_fee_payments'
    await expect(expireStaleFeePayments(admin(), NOW, { close })).rejects.toThrow(/stale read failed/)
    expect(close).not.toHaveBeenCalled()
  })

  // Fail closed: sweeping without knowing which rows a request owns could
  // cancel a `payment_received` one.
  it('throws before closing anything when the request lookup fails', async () => {
    const row = seedPayment({ provider: 'manual', provider_reference: null })
    seedRequest(row, 'payment_received')
    const close = closer('closed')
    failing.read = 'platform_payment_requests'
    await expect(expireStaleFeePayments(admin(), NOW, { close })).rejects.toThrow(/platform_payment_requests lookup failed/)
    expect(close).not.toHaveBeenCalled()
    expect(row.status).toBe('pending')
  })

  it('honours the env TTL and a per-rail override', async () => {
    process.env.CHECKOUT_TTL_MINUTES = '60'
    FEE_PAYMENT_TTL_MINUTES.binance = 6 * 60
    const stripe = seedPayment({ created_at: hoursAgo(2) })
    const binance = seedPayment({ provider: 'binance', provider_reference: 'prepay-1', created_at: hoursAgo(2) })
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('closed') })
    expect(result).toMatchObject({ scanned: 1, expired: 1 })
    expect(stripe.status).toBe('canceled')
    expect(binance.status).toBe('pending')
  })

  // Open manual fee requests older than the TTL are a steady population (a
  // request lives 14 days). They sit at the head of an oldest-first read and
  // must not keep the sweep from ever reaching the abandoned checkouts.
  it('pages past request-owned rows to reach the rows it can act on', async () => {
    for (let i = 0; i < 250; i++) {
      seedRequest(seedPayment({ provider: 'manual', provider_reference: null, created_at: hoursAgo(200) }), 'pending')
    }
    const abandoned = seedPayment({ created_at: hoursAgo(30) })
    const result = await expireStaleFeePayments(admin(), NOW, { close: closer('closed') })
    expect(result).toEqual({ scanned: 251, skipped: 250, recovered: 0, waiting: 0, expired: 1 })
    expect(abandoned.status).toBe('canceled')
    // The request lookup's id list stays inside the URL budget.
    expect(Math.max(...inListSizes)).toBeLessThanOrEqual(200)
  })

  it('caps the provider calls of one pass; the next pass continues', async () => {
    for (let i = 0; i < FEE_PAYMENT_EXPIRY_BATCH_LIMIT + 50; i++) seedPayment()
    const close = closer('closed')
    const first = await expireStaleFeePayments(admin(), NOW, { close })
    expect(close).toHaveBeenCalledTimes(FEE_PAYMENT_EXPIRY_BATCH_LIMIT)
    expect(first.expired).toBe(FEE_PAYMENT_EXPIRY_BATCH_LIMIT)

    const second = await expireStaleFeePayments(admin(), NOW, { close })
    expect(second.expired).toBe(50)
    expect(db.platform_fee_payments.every((row) => row.status === 'canceled')).toBe(true)
  })

  it('is idempotent: a second run finds nothing left to do', async () => {
    seedPayment()
    await expireStaleFeePayments(admin(), NOW, { close: closer('closed') })
    const close = closer('closed')
    expect(await expireStaleFeePayments(admin(), NOW, { close })).toEqual({
      scanned: 0,
      skipped: 0,
      recovered: 0,
      waiting: 0,
      expired: 0,
    })
    expect(close).not.toHaveBeenCalled()
  })
})

describe('expire-stale-checkouts cron — fee payment phase', () => {
  function req(secret = 'cron-secret'): NextRequest {
    return {
      headers: { get: (k: string) => (k === 'authorization' ? `Bearer ${secret}` : null) },
    } as unknown as NextRequest
  }

  const realAge = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString()

  it('rejects a request without the cron secret before either phase runs', async () => {
    const row = seedPayment({ created_at: realAge(30) })
    const res = await GET(req('wrong'))
    expect(res.status).toBe(401)
    expect(row.status).toBe('pending')
  })

  it('reports the fee sweep under fee_payments, next to the checkout counts', async () => {
    h.close.mockImplementation(async (_admin: SupabaseClient, row: FeeCheckoutRow) =>
      row.provider === 'paypal' ? 'paid' : 'closed',
    )
    const abandoned = seedPayment({ created_at: realAge(30) })
    const paid = seedPayment({ provider: 'paypal', provider_reference: 'ORDER-1', created_at: realAge(30) })
    const owned = seedPayment({ provider: 'manual', provider_reference: null, created_at: realAge(30) })
    seedRequest(owned, 'payment_received')

    const res = await GET(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      scanned: 0,
      recovered: 0,
      expired: 0,
      stale_pending: 0,
      fee_payments: { scanned: 3, skipped: 1, recovered: 1, waiting: 0, expired: 1 },
    })
    expect(abandoned.status).toBe('canceled')
    expect(paid.status).toBe('pending')
    expect(owned.status).toBe('pending')
  })

  it('still sweeps fee payments when the checkout phase fails, and answers 500', async () => {
    h.close.mockImplementation(async () => 'closed')
    const row = seedPayment({ created_at: realAge(30) })
    failing.read = 'transactions'
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      error: 'Query failed',
      fee_payments: { scanned: 1, skipped: 0, recovered: 0, waiting: 0, expired: 1 },
    })
    expect(row.status).toBe('canceled')
  })

  it('still reports the checkout phase when the fee sweep fails, and answers 500', async () => {
    h.close.mockImplementation(async () => 'closed')
    db.transactions.push({
      transaction_id: 1,
      user_id: 'user-1',
      tenant_id: TENANT,
      payment_provider: 'lemonsqueezy',
      provider_checkout_id: null,
      amount: 49,
      currency: 'usd',
      plan_id: null,
      product_id: 10,
      status: 'pending',
      checkout_expires_at: realAge(1),
      transaction_date: realAge(25),
    })
    const row = seedPayment({ created_at: realAge(30) })
    failing.read = 'platform_fee_payments'
    const res = await GET(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({
      scanned: 1,
      recovered: 0,
      expired: 1,
      stale_pending: 0,
      fee_payments: { error: 'Fee payment phase failed' },
    })
    expect(db.transactions[0].status).toBe('canceled')
    expect(row.status).toBe('pending')
  })
})
