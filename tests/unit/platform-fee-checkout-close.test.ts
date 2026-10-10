import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBillingEvent } from '@/lib/payments/types'

/**
 * Closing a platform-fee pay-now checkout at its provider before the row is
 * cancelled (#951).
 *
 * `settle_platform_fee_payment()` credits only a `pending` row, so the answer
 * here decides whether money can be lost: `closed` is only ever given for a
 * checkout that can no longer be paid, and a paid one is credited through the
 * webhook's own settle path with the webhook's own charge id. The cases worth
 * pinning are the ones where cancelling would be WRONG (paid, in motion,
 * provider silent, somebody else's checkout).
 *
 * Fake Stripe / PayPal as plain objects, the REAL Stripe webhook mapper: the
 * in-place settle is only safe if it reports what the webhook would have.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'
const PAYMENT = '22222222-2222-2222-2222-222222222222'

const h = vi.hoisted(() => ({
  stripeThrows: false,
  sessionsRetrieve: vi.fn(),
  sessionsExpire: vi.fn(),
  intentsRetrieve: vi.fn(),
  intentsCancel: vi.fn(),
  paypalThrows: false,
  getOrder: vi.fn(),
  captureOrder: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: () => {
    if (h.stripeThrows) throw new Error('STRIPE_SECRET_KEY is not set in environment variables')
    return {
      checkout: { sessions: { retrieve: h.sessionsRetrieve, expire: h.sessionsExpire } },
      paymentIntents: { retrieve: h.intentsRetrieve, cancel: h.intentsCancel },
    }
  },
}))

vi.mock('@/lib/billing/platform-billing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/billing/platform-billing')>()
  return {
    ...actual,
    getPlatformBillingProvider: (provider: string) => {
      if (provider !== 'paypal') return actual.getPlatformBillingProvider(provider as never)
      if (h.paypalThrows) throw new Error('PayPal credentials are required')
      return { getOrder: h.getOrder, captureOrder: h.captureOrder }
    },
  }
})

import { closeFeeCheckoutAtProvider, type FeeCheckoutRow } from '@/lib/billing/platform-fee-checkout-close'
import { handlePlatformFeeEvent } from '@/lib/billing/platform-fee-settlement'
import { StripePaymentProvider } from '@/lib/payments/stripe-provider'

function fakeAdmin(outcome: string = 'settled', rpcError: { message: string } | null = null) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: outcome, error: null })
    },
    from: (table: string) => {
      throw new Error(`unexpected table access: ${table}`)
    },
  }
  return { admin: admin as unknown as SupabaseClient, rpcCalls }
}

const row = (over: Partial<FeeCheckoutRow> = {}): FeeCheckoutRow => ({
  payment_id: PAYMENT,
  tenant_id: TENANT,
  provider: 'stripe',
  provider_reference: 'cs_1',
  amount: 25,
  currency: 'USD',
  ...over,
})

const feeMetadata = { reference: `platform_fee:${TENANT}:${PAYMENT}`, kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT }

const session = (over: Record<string, unknown> = {}) => ({
  id: 'cs_1',
  object: 'checkout.session',
  mode: 'payment',
  status: 'open',
  payment_status: 'unpaid',
  payment_intent: null,
  amount_total: 2500,
  currency: 'usd',
  customer: null,
  metadata: feeMetadata,
  ...over,
})

const paidSession = (over: Record<string, unknown> = {}) =>
  session({ status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', ...over })

const order = (over: Record<string, unknown> = {}) => ({
  status: 'CREATED',
  reference: `platform_fee:${TENANT}:${PAYMENT}`,
  metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT },
  ...over,
})

const stripeMissing = () => Object.assign(new Error('No such checkout.session'), { statusCode: 404, code: 'resource_missing' })

beforeEach(() => {
  h.stripeThrows = false
  h.paypalThrows = false
  for (const fn of [h.sessionsRetrieve, h.sessionsExpire, h.intentsRetrieve, h.intentsCancel, h.getOrder, h.captureOrder]) {
    fn.mockReset()
  }
  h.sessionsExpire.mockResolvedValue(session({ status: 'expired' }))
  process.env.STRIPE_SECRET_KEY = 'sk_test_unit'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('closeFeeCheckoutAtProvider — no checkout was opened', () => {
  it('a row with no provider reference is closed without asking anyone', async () => {
    const { admin, rpcCalls } = fakeAdmin()
    for (const provider of ['stripe', 'paypal', 'binance', 'solana', 'manual']) {
      expect(await closeFeeCheckoutAtProvider(admin, row({ provider, provider_reference: null }))).toBe('closed')
    }
    expect(h.sessionsRetrieve).not.toHaveBeenCalled()
    expect(h.getOrder).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('closeFeeCheckoutAtProvider — Stripe Checkout Session', () => {
  it('an open session is expired at Stripe, then reported closed', async () => {
    h.sessionsRetrieve.mockResolvedValue(session())
    const { admin, rpcCalls } = fakeAdmin()
    expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('closed')
    expect(h.sessionsExpire).toHaveBeenCalledWith('cs_1')
    expect(rpcCalls).toHaveLength(0)
  })

  it('an already expired session is closed with nothing to expire', async () => {
    h.sessionsRetrieve.mockResolvedValue(session({ status: 'expired' }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('closed')
    expect(h.sessionsExpire).not.toHaveBeenCalled()
  })

  it('a session Stripe no longer knows is closed', async () => {
    h.sessionsRetrieve.mockRejectedValue(stripeMissing())
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('closed')
  })

  // An outage is not an abandonment: cancelling on a failed lookup would drop
  // live checkouts in a batch every time Stripe has a bad minute.
  it('Stripe not answering is unknown, never closed', async () => {
    h.sessionsRetrieve.mockRejectedValue(Object.assign(new Error('rate limited'), { statusCode: 429 }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')
    expect(h.sessionsExpire).not.toHaveBeenCalled()
  })

  it('a missing STRIPE_SECRET_KEY is unknown, and does not throw', async () => {
    h.stripeThrows = true
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')
  })

  it('a completed, paid session is never closed — it is credited through the settle function', async () => {
    h.sessionsRetrieve.mockResolvedValue(paidSession())
    const { admin, rpcCalls } = fakeAdmin('settled')
    expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('paid')
    expect(h.sessionsExpire).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([
      {
        fn: 'settle_platform_fee_payment',
        args: {
          _payment_id: PAYMENT,
          _tenant_id: TENANT,
          _provider: 'stripe',
          _provider_charge_id: 'pi_1',
          _amount: 25,
          _currency: 'usd',
        },
      },
    ])
  })

  // The condition that makes settling here safe: idempotency is on
  // (provider, provider_charge_id), so a different spelling of the charge id
  // would let the late webhook credit the same money a second time.
  it('settles with exactly what the checkout.session.completed webhook would have sent', async () => {
    for (const paid of [paidSession(), paidSession({ payment_intent: { id: 'pi_expanded', object: 'payment_intent' } })]) {
      h.sessionsRetrieve.mockResolvedValue(paid)
      const closed = fakeAdmin()
      await closeFeeCheckoutAtProvider(closed.admin, row())

      const webhook = fakeAdmin()
      const event = await new StripePaymentProvider('sk_test_unit', 'whsec_unit').normalizeWebhookEvent(
        JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: paid } }),
      )
      await handlePlatformFeeEvent(event as NormalizedBillingEvent, { provider: 'stripe', admin: webhook.admin })

      expect(closed.rpcCalls).toHaveLength(1)
      expect(closed.rpcCalls).toEqual(webhook.rpcCalls)
    }
  })

  it('stays paid when the settle is a duplicate, a mismatch, or fails outright', async () => {
    h.sessionsRetrieve.mockResolvedValue(paidSession())
    for (const outcome of ['duplicate', 'mismatch', 'not_pending']) {
      expect(await closeFeeCheckoutAtProvider(fakeAdmin(outcome).admin, row())).toBe('paid')
    }
    expect(await closeFeeCheckoutAtProvider(fakeAdmin('settled', { message: 'db down' }).admin, row())).toBe('paid')
  })

  // The payer hit "Pay" between our read and our expire.
  it('re-reads a session that could not be expired: paid wins over closing', async () => {
    h.sessionsRetrieve.mockResolvedValueOnce(session()).mockResolvedValueOnce(paidSession())
    h.sessionsExpire.mockRejectedValue(new Error('Only Checkout Sessions with a status in ["open"] can be expired'))
    const { admin, rpcCalls } = fakeAdmin()
    expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('paid')
    expect(rpcCalls).toHaveLength(1)
  })

  it('re-reads a session that could not be expired: lapsed is closed, still open is unknown', async () => {
    h.sessionsExpire.mockRejectedValue(new Error('expire failed'))
    h.sessionsRetrieve.mockResolvedValueOnce(session()).mockResolvedValueOnce(session({ status: 'expired' }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('closed')

    h.sessionsRetrieve.mockReset().mockResolvedValue(session())
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')

    h.sessionsRetrieve.mockReset().mockResolvedValueOnce(session()).mockRejectedValueOnce(new Error('timeout'))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')
  })

  // A reference that points at another payment's session says nothing about
  // this row, and acting on it would expire or credit that other payment.
  it("never expires or credits a session that is another payment's", async () => {
    const { admin, rpcCalls } = fakeAdmin()
    for (const metadata of [{ ...feeMetadata, payment_id: 'someone-else' }, { ...feeMetadata, tenant_id: 'other-tenant' }, null]) {
      h.sessionsRetrieve.mockResolvedValue(session({ metadata }))
      expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('unknown')
      h.sessionsRetrieve.mockResolvedValue(paidSession({ metadata }))
      expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('unknown')
    }
    expect(h.sessionsExpire).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
  })

  describe('delayed payment method (session complete, payment unpaid)', () => {
    const delayed = () => session({ status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_delayed' })

    it('money still moving is paid, and is left for async_payment_succeeded to credit', async () => {
      for (const status of ['processing', 'requires_action', 'succeeded']) {
        h.sessionsRetrieve.mockResolvedValue(delayed())
        h.intentsRetrieve.mockResolvedValue({ id: 'pi_delayed', status })
        const { admin, rpcCalls } = fakeAdmin()
        expect(await closeFeeCheckoutAtProvider(admin, row())).toBe('paid')
        expect(rpcCalls).toHaveLength(0)
      }
      expect(h.intentsCancel).not.toHaveBeenCalled()
    })

    it('a failed delayed payment is cancelled at Stripe, then closed', async () => {
      h.sessionsRetrieve.mockResolvedValue(delayed())
      h.intentsRetrieve.mockResolvedValue({ id: 'pi_delayed', status: 'requires_payment_method' })
      h.intentsCancel.mockResolvedValue({ id: 'pi_delayed', status: 'canceled' })
      expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('closed')
      expect(h.intentsCancel).toHaveBeenCalledWith('pi_delayed')
    })

    it('is not closed when that cancel fails, or the payment cannot be read', async () => {
      h.sessionsRetrieve.mockResolvedValue(delayed())
      h.intentsRetrieve.mockResolvedValue({ id: 'pi_delayed', status: 'requires_payment_method' })
      h.intentsCancel.mockRejectedValue(new Error('cannot cancel'))
      expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')

      h.intentsRetrieve.mockRejectedValue(new Error('timeout'))
      expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('unknown')
    })

    it('an already cancelled payment is closed; one with no payment at all stays paid', async () => {
      h.sessionsRetrieve.mockResolvedValue(delayed())
      h.intentsRetrieve.mockResolvedValue({ id: 'pi_delayed', status: 'canceled' })
      expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('closed')

      h.sessionsRetrieve.mockResolvedValue(session({ status: 'complete', payment_status: 'unpaid', payment_intent: null }))
      expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, row())).toBe('paid')
    })
  })
})

describe('closeFeeCheckoutAtProvider — PayPal order', () => {
  const paypalRow = (over: Partial<FeeCheckoutRow> = {}) => row({ provider: 'paypal', provider_reference: 'ORDER-1', ...over })

  // Orders v2 never captures on its own, and the capture route refuses a row
  // that is no longer pending — so an uncaptured order cannot take money.
  it('an order with no capture is closed, whatever its status', async () => {
    for (const status of ['CREATED', 'PAYER_ACTION_REQUIRED', 'APPROVED', 'VOIDED']) {
      h.getOrder.mockResolvedValue(order({ status }))
      const { admin, rpcCalls } = fakeAdmin()
      expect(await closeFeeCheckoutAtProvider(admin, paypalRow())).toBe('closed')
      expect(rpcCalls).toHaveLength(0)
    }
    expect(h.getOrder).toHaveBeenCalledWith('ORDER-1')
    // Capturing is the school's own return route's job, never this function's.
    expect(h.captureOrder).not.toHaveBeenCalled()
  })

  it('a COMPLETED capture is paid, and credited with the event the capture route dispatches', async () => {
    h.getOrder.mockResolvedValue(
      order({ status: 'COMPLETED', captureId: 'CAP-1', captureStatus: 'COMPLETED', amount: 25, currency: 'usd' }),
    )
    const { admin, rpcCalls } = fakeAdmin()
    expect(await closeFeeCheckoutAtProvider(admin, paypalRow())).toBe('paid')
    expect(rpcCalls).toEqual([
      {
        fn: 'settle_platform_fee_payment',
        args: {
          _payment_id: PAYMENT,
          _tenant_id: TENANT,
          _provider: 'paypal',
          _provider_charge_id: 'CAP-1',
          _amount: 25,
          _currency: 'usd',
        },
      },
    ])
  })

  // eCheck / risk review: money is moving. PAYMENT.CAPTURE.COMPLETED or
  // .DENIED decides, not this pass.
  it('a capture in any other state is paid but not credited here', async () => {
    for (const captureStatus of ['PENDING', 'DECLINED', undefined]) {
      h.getOrder.mockResolvedValue(order({ status: 'COMPLETED', captureId: 'CAP-2', captureStatus }))
      const { admin, rpcCalls } = fakeAdmin()
      expect(await closeFeeCheckoutAtProvider(admin, paypalRow())).toBe('paid')
      expect(rpcCalls).toHaveLength(0)
    }
  })

  it('stays paid when crediting the capture fails', async () => {
    h.getOrder.mockResolvedValue(order({ captureId: 'CAP-3', captureStatus: 'COMPLETED', amount: 25, currency: 'usd' }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin('settled', { message: 'db down' }).admin, paypalRow())).toBe('paid')
  })

  it('an order PayPal no longer knows is closed', async () => {
    h.getOrder.mockRejectedValue(Object.assign(new Error('PayPal getOrder failed: HTTP 404'), { status: 404 }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, paypalRow())).toBe('closed')
  })

  it('PayPal not answering, or not configured, is unknown', async () => {
    h.getOrder.mockRejectedValue(Object.assign(new Error('PayPal getOrder failed: HTTP 503'), { status: 503 }))
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, paypalRow())).toBe('unknown')

    h.paypalThrows = true
    expect(await closeFeeCheckoutAtProvider(fakeAdmin().admin, paypalRow())).toBe('unknown')
  })

  it("never closes or credits an order that is another payment's", async () => {
    const { admin, rpcCalls } = fakeAdmin()
    h.getOrder.mockResolvedValue(order({ metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: 'someone-else' } }))
    expect(await closeFeeCheckoutAtProvider(admin, paypalRow())).toBe('unknown')
    h.getOrder.mockResolvedValue(
      order({ metadata: undefined, captureId: 'CAP-9', captureStatus: 'COMPLETED', amount: 25, currency: 'usd' }),
    )
    expect(await closeFeeCheckoutAtProvider(admin, paypalRow())).toBe('unknown')
    expect(rpcCalls).toHaveLength(0)
  })
})

describe('closeFeeCheckoutAtProvider — rails that cannot be asked', () => {
  // No new Binance API call until its field names are confirmed (#952).
  it('Binance Pay and any rail without a closer are unsupported, with no provider call', async () => {
    const { admin, rpcCalls } = fakeAdmin()
    for (const provider of ['binance', 'lemonsqueezy']) {
      expect(await closeFeeCheckoutAtProvider(admin, row({ provider, provider_reference: 'ref-1' }))).toBe('unsupported')
    }
    expect(h.sessionsRetrieve).not.toHaveBeenCalled()
    expect(h.getOrder).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
  })

  // Solana Pay and manual settle only through their platform_payment_requests
  // row (/api/billing/solana/tx and /verify 404 without it; the super-admin
  // confirm takes a request id). The callers hand over only rows that have none.
  it('an orphan Solana or manual row is closed: nothing can credit it without its request', async () => {
    for (const provider of ['solana', 'manual']) {
      expect(
        await closeFeeCheckoutAtProvider(fakeAdmin().admin, row({ provider, provider_reference: 'some-reference' })),
      ).toBe('closed')
    }
  })
})
