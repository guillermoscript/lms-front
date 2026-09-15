import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * `payment_intent.payment_failed` in `/api/stripe/webhook` (#756).
 *
 * It used to write `status = 'failed'` guarded only by `.neq('status','failed')`:
 *   - a failed PLAN row runs cancel_subscription in trigger_manage_transactions,
 *     so one declined card on a renewal ended the buyer's live subscription;
 *   - the guard matched 'successful' rows, so a failed-attempt event delivered
 *     after the successful attempt flipped a settled sale.
 *
 * A declined attempt now never writes the transaction — the PaymentIntent is
 * still payable and a retry settles the same row. PAYMENT_FAILED is emitted only
 * while the row is still pending.
 */

type Row = Record<string, unknown>
interface Call {
  table: string
  op: 'select' | 'update' | 'insert' | 'delete' | 'upsert'
  values?: Row
  eq: [string, unknown][]
}

const state: { row: Row | null; calls: Call[] } = { row: null, calls: [] }

function makeAdmin() {
  function builder(table: string) {
    const call: Call = { table, op: 'select', eq: [] }
    const resolve = () => {
      state.calls.push(call)
      if (table !== 'transactions' || call.op !== 'select') return { data: null, error: null }
      const row = state.row
      const matches = row && call.eq.every(([col, val]) => row[col] === val)
      return { data: matches ? row : null, error: null }
    }
    const b: Record<string, unknown> = {
      select: () => b,
      update: (v: Row) => {
        call.op = 'update'
        call.values = v
        return b
      },
      insert: (v: Row) => {
        call.op = 'insert'
        call.values = v
        return b
      },
      upsert: (v: Row) => {
        call.op = 'upsert'
        call.values = v
        return b
      },
      delete: () => {
        call.op = 'delete'
        return b
      },
      eq: (col: string, val: unknown) => {
        call.eq.push([col, val])
        return b
      },
      neq: () => b,
      single: () => Promise.resolve(resolve()),
      maybeSingle: () => Promise.resolve(resolve()),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled),
    }
    return b
  }
  return { from: (t: string) => builder(t), rpc: vi.fn() }
}

let stripeEvent: Row = {}
const tracked: { event: string; props: Row; ctx: Row }[] = []

vi.mock('@supabase/supabase-js', () => ({ createClient: () => makeAdmin() }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ webhooks: { constructEvent: () => stripeEvent } }),
  getWebhookSecret: () => 'whsec_test',
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/payments/webhook-dispatch', () => ({ dispatchBillingEvent: vi.fn() }))
vi.mock('@/lib/analytics/server', () => ({
  track: (event: string, props: Row, ctx: Row) => {
    tracked.push({ event, props, ctx })
    return Promise.resolve()
  },
  safeAnalytics: (fn: () => Promise<unknown>) => fn(),
}))

import { POST } from '@/app/api/stripe/webhook/route'

function failedAttempt(transactionId: number): Row {
  return {
    id: 'evt_failed',
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: 'pi_1',
        metadata: { transactionId: String(transactionId) },
        last_payment_error: { code: 'card_declined', decline_code: 'insufficient_funds' },
      },
    },
  }
}

function req(): NextRequest {
  return {
    text: () => Promise.resolve('{}'),
    headers: new Headers({ 'stripe-signature': 't=1,v1=sig' }),
  } as unknown as NextRequest
}

const writes = () => state.calls.filter(c => c.table === 'transactions' && c.op !== 'select')

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role'
  state.row = null
  state.calls = []
  tracked.length = 0
})

describe('POST /api/stripe/webhook — payment_intent.payment_failed (#756)', () => {
  it('a declined card on a pending PLAN row writes nothing (subscription untouched) and reports the failure', async () => {
    state.row = {
      transaction_id: 900,
      status: 'pending',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      amount: 20,
      currency: 'usd',
      plan_id: 5,
      product_id: null,
    }
    stripeEvent = failedAttempt(900)

    const res = await POST(req())

    expect(res.status).toBe(200)
    // No transaction write means trigger_manage_transactions never runs its
    // `failed` → cancel_subscription branch, and a retry on the same
    // PaymentIntent can still settle this row.
    expect(writes()).toHaveLength(0)
    expect(state.calls.some(c => c.table === 'subscriptions')).toBe(false)

    const failed = tracked.find(t => t.event === 'payment_failed')
    expect(failed).toBeDefined()
    expect(failed!.props).toMatchObject({
      provider: 'stripe',
      failure_reason: 'card_declined',
      decline_code: 'insufficient_funds',
      is_subscription: true,
      transaction_id: 900,
    })
    expect(failed!.ctx).toMatchObject({ userId: 'user-1', tenantId: 'tenant-1' })
  })

  it('a payment_failed delivered after payment_intent.succeeded leaves the successful row alone and reports nothing', async () => {
    state.row = {
      transaction_id: 901,
      status: 'successful',
      user_id: 'user-1',
      tenant_id: 'tenant-1',
      amount: 50,
      currency: 'usd',
      plan_id: null,
      product_id: 10,
    }
    stripeEvent = failedAttempt(901)

    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(writes()).toHaveLength(0)
    expect(state.row.status).toBe('successful')
    expect(tracked.find(t => t.event === 'payment_failed')).toBeUndefined()
  })
})
