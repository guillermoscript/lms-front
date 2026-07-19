import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  PayPalPaymentProvider,
  encodePayPalCustomId,
  decodePayPalCustomId,
} from '@/lib/payments/paypal-provider'
import { BinancePayProvider } from '@/lib/payments/binance-provider'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'

/**
 * Pins the pure/offline parts of the two new providers (issue #466): the
 * custom_id owner-binding round-trip, webhook signature verification math
 * (Binance RSA — self-contained; PayPal's verify is an API call and not
 * testable offline), and the webhook → NormalizedBillingEvent mappings the
 * shared dispatcher depends on. No network: normalize paths that would fetch
 * (PayPal renewal period lookup) are exercised only where they don't.
 */

// ---------------------------------------------------------------------------
// PayPal custom_id encode/decode (owner-binding metadata round-trip)
// ---------------------------------------------------------------------------

describe('encodePayPalCustomId / decodePayPalCustomId', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440000'
  const tenantId = '00000000-0000-0000-0000-000000000001'

  it('round-trips reference + userId + tenantId', () => {
    const encoded = encodePayPalCustomId('12345', { userId, tenantId })
    expect(encoded.length).toBeLessThanOrEqual(127) // PayPal custom_id limit
    const decoded = decodePayPalCustomId(encoded)
    expect(decoded.reference).toBe('12345')
    expect(decoded.metadata).toEqual({ userId, tenantId })
  })

  it('omits metadata when owner ids are absent (dispatcher then fails closed)', () => {
    const decoded = decodePayPalCustomId(encodePayPalCustomId('99', {}))
    expect(decoded.reference).toBe('99')
    expect(decoded.metadata).toBeUndefined()
  })

  it('returns empty object for null/undefined/garbage', () => {
    expect(decodePayPalCustomId(null)).toEqual({})
    expect(decodePayPalCustomId(undefined)).toEqual({})
    expect(decodePayPalCustomId('')).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// PayPal webhook → NormalizedBillingEvent
// ---------------------------------------------------------------------------

describe('PayPalPaymentProvider.normalizeWebhookEvent', () => {
  const provider = new PayPalPaymentProvider('client', 'secret', 'wh-id', 'sandbox')
  const customId = encodePayPalCustomId('42', {
    userId: 'user-uuid',
    tenantId: 'tenant-uuid',
  })

  it('maps PAYMENT.CAPTURE.COMPLETED → payment.succeeded with owner metadata', async () => {
    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-1',
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAP-1', custom_id: customId },
      }),
    )
    expect(event).toMatchObject({
      type: 'payment.succeeded',
      providerEventId: 'WH-1',
      providerPaymentId: 'CAP-1',
      reference: '42',
      metadata: { userId: 'user-uuid', tenantId: 'tenant-uuid' },
    })
  })

  it('maps BILLING.SUBSCRIPTION.ACTIVATED → subscription.activated with periodEnd', async () => {
    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-2',
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: {
          id: 'I-SUB1',
          custom_id: customId,
          billing_info: { next_billing_time: '2026-08-19T00:00:00Z' },
        },
      }),
    )
    expect(event).toMatchObject({
      type: 'subscription.activated',
      providerEventId: 'WH-2',
      providerSubscriptionId: 'I-SUB1',
      reference: '42',
      metadata: { userId: 'user-uuid', tenantId: 'tenant-uuid' },
    })
    expect(event?.periodEnd?.toISOString()).toBe('2026-08-19T00:00:00.000Z')
  })

  it('maps CANCELLED/EXPIRED/SUSPENDED to canceled/expired/past_due', async () => {
    for (const [ppType, ours] of [
      ['BILLING.SUBSCRIPTION.CANCELLED', 'subscription.canceled'],
      ['BILLING.SUBSCRIPTION.EXPIRED', 'subscription.expired'],
      ['BILLING.SUBSCRIPTION.SUSPENDED', 'subscription.past_due'],
    ] as const) {
      const event = await provider.normalizeWebhookEvent(
        JSON.stringify({ id: 'WH-x', event_type: ppType, resource: { id: 'I-SUB1' } }),
      )
      expect(event?.type).toBe(ours)
      expect(event?.providerSubscriptionId).toBe('I-SUB1')
    }
  })

  it('maps PAYMENT.CAPTURE.REFUNDED → refund.succeeded', async () => {
    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-3',
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: 'REF-1', custom_id: customId },
      }),
    )
    expect(event).toMatchObject({ type: 'refund.succeeded', reference: '42' })
  })

  it('returns null for unmodelled events, sales without a subscription, and bad JSON', async () => {
    expect(
      await provider.normalizeWebhookEvent(
        JSON.stringify({ id: 'WH-4', event_type: 'CUSTOMER.DISPUTE.CREATED', resource: {} }),
      ),
    ).toBeNull()
    // A plain sale with no billing_agreement_id is outside our subscription flow.
    expect(
      await provider.normalizeWebhookEvent(
        JSON.stringify({ id: 'WH-5', event_type: 'PAYMENT.SALE.COMPLETED', resource: { id: 'S-1' } }),
      ),
    ).toBeNull()
    expect(await provider.normalizeWebhookEvent('not json')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Binance Pay webhook signature verification (RSA-SHA256, offline)
// ---------------------------------------------------------------------------

describe('BinancePayProvider.verifyWebhook', () => {
  const provider = new BinancePayProvider('api-key', 'api-secret')
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  // Prime the cert cache so verify does not call Binance's certificates API.
  ;(provider as unknown as { certPublicKey: string }).certPublicKey = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString()

  function sign(timestamp: string, nonce: string, body: string): string {
    return crypto
      .createSign('RSA-SHA256')
      .update(`${timestamp}\n${nonce}\n${body}\n`)
      .sign(privateKey, 'base64')
  }

  const body = JSON.stringify({ bizType: 'PAY', bizStatus: 'PAY_SUCCESS' })

  it('accepts a correctly signed payload (lowercased headers, as the route passes them)', async () => {
    const headers = {
      'binancepay-timestamp': '1700000000000',
      'binancepay-nonce': 'nonce123',
      'binancepay-signature': sign('1700000000000', 'nonce123', body),
    }
    expect(await provider.verifyWebhook(body, headers)).toBe(true)
  })

  it('rejects a tampered body and missing headers', async () => {
    const headers = {
      'binancepay-timestamp': '1700000000000',
      'binancepay-nonce': 'nonce123',
      'binancepay-signature': sign('1700000000000', 'nonce123', body),
    }
    expect(await provider.verifyWebhook(body.replace('PAY_SUCCESS', 'PAY_CLOSED'), headers)).toBe(false)
    expect(await provider.verifyWebhook(body, {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Binance Pay webhook → NormalizedBillingEvent
// ---------------------------------------------------------------------------

describe('BinancePayProvider.normalizeWebhookEvent', () => {
  const provider = new BinancePayProvider('api-key', 'api-secret')

  function payNotification(passThrough: Record<string, string>, bizStatus = 'PAY_SUCCESS') {
    return JSON.stringify({
      bizType: 'PAY',
      bizStatus,
      bizIdStr: '987654321',
      data: JSON.stringify({
        merchantTradeNo: '42',
        passThroughInfo: JSON.stringify(passThrough),
      }),
    })
  }

  it('maps a plan PAY_SUCCESS → subscription.activated (self-managed period)', async () => {
    const event = await provider.normalizeWebhookEvent(
      payNotification({ userId: 'u1', tenantId: 't1', planId: '7' }),
    )
    expect(event).toMatchObject({
      type: 'subscription.activated',
      providerEventId: 'PAY:987654321:PAY_SUCCESS',
      providerSubscriptionId: '987654321',
      reference: '42',
      metadata: { userId: 'u1', tenantId: 't1' },
    })
  })

  it('maps a product PAY_SUCCESS → payment.succeeded', async () => {
    const event = await provider.normalizeWebhookEvent(
      payNotification({ userId: 'u1', tenantId: 't1', productId: '9' }),
    )
    expect(event).toMatchObject({
      type: 'payment.succeeded',
      providerPaymentId: '987654321',
      reference: '42',
      metadata: { userId: 'u1', tenantId: 't1' },
    })
  })

  it('maps PAY_CLOSED → payment.failed and refunds → refund.succeeded', async () => {
    const closed = await provider.normalizeWebhookEvent(payNotification({}, 'PAY_CLOSED'))
    expect(closed?.type).toBe('payment.failed')

    const refund = await provider.normalizeWebhookEvent(
      JSON.stringify({
        bizType: 'PAY_REFUND',
        bizStatus: 'REFUND_SUCCESS',
        bizIdStr: '555',
        data: JSON.stringify({ merchantTradeNo: '42' }),
      }),
    )
    expect(refund).toMatchObject({ type: 'refund.succeeded', reference: '42' })
  })

  it('returns null for unknown bizTypes and bad JSON', async () => {
    expect(
      await provider.normalizeWebhookEvent(JSON.stringify({ bizType: 'PAYOUT', bizStatus: 'X' })),
    ).toBeNull()
    expect(await provider.normalizeWebhookEvent('not json')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Capability table stays in sync with the provider classes
// ---------------------------------------------------------------------------

describe('PROVIDER_CAPABILITIES sync', () => {
  it('paypal static entry matches the class capabilities', () => {
    const p = new PayPalPaymentProvider('c', 's')
    expect(p.capabilities).toEqual(PROVIDER_CAPABILITIES.paypal)
  })

  it('binance static entry matches the class capabilities', () => {
    const b = new BinancePayProvider('k', 's')
    expect(b.capabilities).toEqual(PROVIDER_CAPABILITIES.binance)
  })
})
