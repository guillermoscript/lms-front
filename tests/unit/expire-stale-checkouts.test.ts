import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * The abandoned-hosted-checkout reconciler (issue #624).
 *
 * The bug this closes is not "a row is untidy" — it is that both purchase
 * uniqueness indexes cover status IN ('pending','successful'), so one abandoned
 * PayPal or Lemon Squeezy redirect blocks that buyer from ever purchasing the
 * same item again. The cases worth pinning are therefore the ones where
 * expiring is WRONG (an approved PayPal order still capturable, a plan checkout
 * that would cancel a live subscription) and the one where it is right.
 *
 * Same in-memory-store fake as expire-platform-subscriptions.test.ts: the pass
 * re-queries `transactions` after its own UPDATE to compute `stale_pending`, so
 * canned per-call replies would hide whether that number reflects the write.
 */

type Row = Record<string, unknown>

const db: Record<string, Row[]> = { transactions: [] }

const tracked: { event: string; props: Row; ctx: Row }[] = []
const dispatched: Row[] = []
const paypalCalls: string[] = []

let paypalOrder: { status: string; captureId?: string; reference?: string } = { status: 'CREATED' }
let paypalGetThrows = false

type Predicate = (row: Row) => boolean

function makeSupabase() {
  function builder(table: string) {
    const preds: Predicate[] = []
    let take = Infinity
    let headCount = false
    let pending: { values: Row } | null = null

    const rows = () => {
      const matched = (db[table] || []).filter(r => preds.every(p => p(r)))
      return matched.slice(0, take === Infinity ? undefined : take)
    }

    function settle() {
      if (headCount) return { data: null, count: rows().length, error: null }
      if (pending) {
        const changed = rows()
        for (const row of changed) Object.assign(row, pending.values)
        return { data: changed.map(r => ({ ...r })), error: null }
      }
      return { data: rows().map(r => ({ ...r })), error: null }
    }

    const b: Record<string, unknown> = {
      select(_c: string, opts?: { head?: boolean; count?: string }) {
        if (opts?.head) headCount = true
        return b
      },
      update(values: Row) {
        pending = { values }
        return b
      },
      eq(col: string, val: unknown) {
        preds.push(r => r[col] === val)
        return b
      },
      in(col: string, vals: unknown[]) {
        preds.push(r => vals.includes(r[col] as never))
        return b
      },
      not(col: string, op: string, val: unknown) {
        if (op !== 'is') throw new Error(`fake: unsupported not(${op})`)
        preds.push(r => (val === null ? r[col] != null : r[col] !== val))
        return b
      },
      lt(col: string, val: string) {
        preds.push(r => r[col] != null && new Date(r[col] as string) < new Date(val))
        return b
      },
      order() {
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

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeSupabase() }))

vi.mock('@/lib/analytics/server', () => ({
  track: (event: string, props: Row, ctx: Row) => {
    tracked.push({ event, props, ctx })
    return Promise.resolve()
  },
  safeAnalytics: (fn: () => Promise<unknown>) => fn(),
}))

vi.mock('@/lib/payments/webhook-dispatch', () => ({
  dispatchBillingEvent: (event: Row) => {
    dispatched.push(event)
    return Promise.resolve()
  },
}))

vi.mock('@/lib/payments', () => ({
  getPaymentProvider: (slug: string) => {
    if (slug !== 'paypal') throw new Error('not configured')
    return {
      getOrder: (orderId: string) => {
        paypalCalls.push(`getOrder:${orderId}`)
        if (paypalGetThrows) return Promise.reject(new Error('paypal 503'))
        return Promise.resolve(paypalOrder)
      },
      captureOrder: (orderId: string) => {
        paypalCalls.push(`captureOrder:${orderId}`)
        return Promise.resolve({
          captureId: 'cap_1',
          status: 'COMPLETED',
          reference: paypalOrder.reference,
        })
      },
    }
  },
}))

import { GET } from '@/app/api/cron/expire-stale-checkouts/route'

const TENANT = '00000000-0000-0000-0000-000000000001'
const USER = 'user-1'
const HOUR = 60 * 60 * 1000

const hoursFromNow = (h: number) => new Date(Date.now() + h * HOUR).toISOString()

function req(secret = 'cron-secret'): NextRequest {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? `Bearer ${secret}` : null) },
  } as unknown as NextRequest
}

let nextId = 1
function seedCheckout(over: Row = {}): Row {
  const row: Row = {
    transaction_id: nextId++,
    user_id: USER,
    tenant_id: TENANT,
    payment_provider: 'lemonsqueezy',
    provider_checkout_id: null,
    amount: 49,
    currency: 'usd',
    plan_id: null,
    product_id: 10,
    status: 'pending',
    checkout_expires_at: hoursFromNow(-1),
    transaction_date: hoursFromNow(-25),
    expired_at: null,
    ...over,
  }
  db.transactions.push(row)
  return row
}

beforeEach(() => {
  db.transactions = []
  tracked.length = 0
  dispatched.length = 0
  paypalCalls.length = 0
  paypalOrder = { status: 'CREATED' }
  paypalGetThrows = false
  nextId = 1
  process.env.CRON_SECRET = 'cron-secret'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
})

describe('expire-stale-checkouts cron', () => {
  it('rejects a request without the cron secret', async () => {
    const res = await GET(req('wrong'))
    expect(res.status).toBe(401)
  })

  it('expires a lapsed Lemon Squeezy checkout so the buyer can retry', async () => {
    const row = seedCheckout()
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ expired: 1, recovered: 0 })
    expect(row.status).toBe('canceled')
    expect(row.expired_at).toBeTypeOf('string')
  })

  // 'failed' would fire trigger_manage_transactions →
  // cancel_subscription(user, plan), killing the subscription the buyer is
  // still paying for when they abandon a RENEWAL checkout. Only 'canceled'
  // misses every branch of that trigger.
  it('expires to canceled, never failed — a failed plan row cancels a live subscription', async () => {
    const row = seedCheckout({ plan_id: 5, product_id: null })
    await GET(req())
    expect(row.status).toBe('canceled')
    expect(row.status).not.toBe('failed')
  })

  it('leaves a checkout whose TTL has not lapsed alone', async () => {
    const row = seedCheckout({ checkout_expires_at: hoursFromNow(+2) })
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ scanned: 0, expired: 0 })
    expect(row.status).toBe('pending')
  })

  // In-band rails never write checkout_expires_at, so they can never enter the
  // queue. A Solana Pay row is reconciled on chain by its own job; expiring it
  // here would cancel a payment that may already be settled.
  it('ignores in-band rails, which carry no checkout TTL at all', async () => {
    const row = seedCheckout({ payment_provider: 'solana', checkout_expires_at: null })
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ scanned: 0, expired: 0 })
    expect(row.status).toBe('pending')
  })

  // The whole reason to reconcile before expiring: PayPal keeps an APPROVED
  // order capturable for ~3 days, well past our 24h TTL. Cancelling here would
  // throw away money the buyer already authorised.
  it('captures an APPROVED PayPal order instead of expiring it', async () => {
    paypalOrder = { status: 'APPROVED', reference: '1' }
    const row = seedCheckout({ payment_provider: 'paypal', provider_checkout_id: 'ORDER-1' })
    const res = await GET(req())

    expect(paypalCalls).toEqual(['getOrder:ORDER-1', 'captureOrder:ORDER-1'])
    expect(dispatched).toHaveLength(1)
    expect(dispatched[0]).toMatchObject({ type: 'payment.succeeded', providerPaymentId: 'cap_1' })
    expect(await res.json()).toMatchObject({ recovered: 1, expired: 0 })
    expect(row.status).toBe('pending') // the dispatcher owns the flip, not this job
  })

  // A capture our own return route already made, whose dispatch died. The order
  // is COMPLETED at PayPal and the money is taken — re-dispatch, never expire.
  it('re-dispatches a COMPLETED PayPal order whose settlement never landed', async () => {
    paypalOrder = { status: 'COMPLETED', captureId: 'cap_9', reference: '1' }
    seedCheckout({ payment_provider: 'paypal', provider_checkout_id: 'ORDER-2' })
    const res = await GET(req())
    expect(dispatched[0]).toMatchObject({ providerPaymentId: 'cap_9' })
    expect(await res.json()).toMatchObject({ recovered: 1, expired: 0 })
  })

  // A provider outage is not an abandonment. Expiring on a failed lookup would
  // cancel live checkouts in a batch every time PayPal has a bad minute.
  it('leaves the row pending when PayPal cannot be reached', async () => {
    paypalGetThrows = true
    const row = seedCheckout({ payment_provider: 'paypal', provider_checkout_id: 'ORDER-3' })
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ expired: 0 })
    expect(row.status).toBe('pending')
  })

  it('expires a PayPal order the buyer never approved', async () => {
    paypalOrder = { status: 'VOIDED' }
    const row = seedCheckout({ payment_provider: 'paypal', provider_checkout_id: 'ORDER-4' })
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ expired: 1 })
    expect(row.status).toBe('canceled')
  })

  it('emits checkout_abandoned backdated to when the checkout started', async () => {
    const row = seedCheckout()
    await GET(req())
    const event = tracked.find(t => t.event === 'checkout_abandoned')
    expect(event).toBeDefined()
    expect(event!.props).toMatchObject({ provider: 'lemonsqueezy', transaction_id: 1, amount: 49 })
    // Backdated, so the funnel attributes the abandonment to the attempt's day
    // rather than the day the cron happened to notice.
    expect(event!.ctx.timestamp).toBe(row.transaction_date)
  })

  it('reports stale_pending as the queue depth left after the pass', async () => {
    seedCheckout()
    seedCheckout()
    const res = await GET(req())
    expect(await res.json()).toMatchObject({ scanned: 2, expired: 2, stale_pending: 0 })
  })
})
