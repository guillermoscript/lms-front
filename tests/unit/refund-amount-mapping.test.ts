import { describe, it, expect } from 'vitest'
import { PayPalPaymentProvider } from '@/lib/payments/paypal-provider'
import { LemonSqueezyProvider } from '@/lib/payments/lemonsqueezy-provider'
import { BinancePayProvider, normalizeBinanceCurrency } from '@/lib/payments/binance-provider'

/**
 * Issue #547 §1 — the UNITS of `NormalizedBillingEvent.amount`.
 *
 * The dispatcher applies this number straight to a school's balance, so a
 * mis-scaled one moves real money: read Lemon Squeezy's cents as dollars and a
 * $10 refund becomes $1,000, wiping out the sale and then some. The contract is
 * that every mapper emits MAJOR units of the transaction's currency, and each
 * provider states its own money differently:
 *
 *   - PayPal  — decimal STRING, major units ('10.00')
 *   - Binance — decimal, major units, in a USD-pegged stablecoin
 *   - Lemon Squeezy — integer CENTS
 *
 * The expected value is written out literally in each case rather than derived
 * from the input, so a conversion that changes still fails here.
 */

// These constructors only stash credentials; nothing below makes a network call.
const paypal = new PayPalPaymentProvider('client', 'secret', 'wh-id', 'sandbox')
const lemonsqueezy = new LemonSqueezyProvider('api-key', 'store-1', 'wh-secret')
const binance = new BinancePayProvider('api-key', 'api-secret')

describe('PayPal refund amounts', () => {
  it('parses the decimal string as major units and lowercases the currency', async () => {
    const event = await paypal.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-1',
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: {
          id: 'REF-1',
          custom_id: 'txn:42',
          amount: { value: '10.00', currency_code: 'USD' },
        },
      }),
    )
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBe(10) // ten dollars, not ten cents
    expect(event?.currency).toBe('usd')
  })

  it('handles a fractional partial refund without losing cents', async () => {
    const event = await paypal.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-2',
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: 'REF-2', custom_id: 'txn:42', amount: { value: '12.34', currency_code: 'EUR' } },
      }),
    )
    expect(event?.amount).toBe(12.34)
    expect(event?.currency).toBe('eur')
  })

  it('omits the amount entirely when the payload carries none → dispatcher falls back to a full refund', async () => {
    const event = await paypal.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-3',
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: 'REF-3', custom_id: 'txn:42' },
      }),
    )
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBeUndefined()
  })
})

describe('Lemon Squeezy refund amounts', () => {
  it('converts CENTS to major units — the conversion that, missed, inflates a refund 100×', async () => {
    const event = await lemonsqueezy.normalizeWebhookEvent(
      JSON.stringify({
        meta: { event_name: 'order_refunded', custom_data: { reference: '42' } },
        data: {
          id: 'ord_1',
          attributes: { refunded_amount: 1000, currency: 'USD', updated_at: '2026-07-01T00:00:00Z' },
        },
      }),
    )
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBe(10) // 1000 cents
    expect(event?.currency).toBe('usd')
  })

  it('keeps sub-dollar precision on a partial refund', async () => {
    const event = await lemonsqueezy.normalizeWebhookEvent(
      JSON.stringify({
        meta: { event_name: 'order_refunded', custom_data: { reference: '42' } },
        data: { id: 'ord_2', attributes: { refunded_amount: 1234, currency: 'USD', updated_at: 'x' } },
      }),
    )
    expect(event?.amount).toBe(12.34)
  })

  it('omits the amount when LS reports none', async () => {
    const event = await lemonsqueezy.normalizeWebhookEvent(
      JSON.stringify({
        meta: { event_name: 'order_refunded', custom_data: { reference: '42' } },
        data: { id: 'ord_3', attributes: { currency: 'USD', updated_at: 'x' } },
      }),
    )
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBeUndefined()
  })
})

describe('Binance Pay refund amounts', () => {
  function refundPayload(data: Record<string, unknown>) {
    return JSON.stringify({
      bizType: 'PAY_REFUND',
      bizStatus: 'REFUND_SUCCESS',
      bizIdStr: '99',
      data: JSON.stringify({ merchantTradeNo: '42', ...data }),
    })
  }

  it('reads the nested refundInfo figure as major units', async () => {
    const event = await binance.normalizeWebhookEvent(
      refundPayload({ refundInfo: { refundedAmount: '10.50', currency: 'USDT' } }),
    )
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBe(10.5)
    // USDT is the 1:1 USD stablecoin our orders are denominated in; the row it
    // settles reads 'usd'. Resolving the peg HERE is what stops the dispatcher's
    // strict currency check from discarding every Binance refund amount.
    expect(event?.currency).toBe('usd')
  })

  it('falls back to a flat top-level field on older payload shapes', async () => {
    const event = await binance.normalizeWebhookEvent(refundPayload({ refundedAmount: 7.25, currency: 'BUSD' }))
    expect(event?.amount).toBe(7.25)
    expect(event?.currency).toBe('usd')
  })

  it('omits the amount when the payload carries no refund figure', async () => {
    const event = await binance.normalizeWebhookEvent(refundPayload({ totalFee: 100 }))
    expect(event?.type).toBe('refund.succeeded')
    expect(event?.amount).toBeUndefined()
  })

  it('passes an UNRECOGNISED ticker through, so it reads as a mismatch downstream', () => {
    // Deliberately not guessed at: an unknown ticker should make the dispatcher
    // fall back to a full refund rather than apply a figure in another unit.
    expect(normalizeBinanceCurrency('USDT')).toBe('usd')
    expect(normalizeBinanceCurrency('BTC')).toBe('btc')
  })
})
