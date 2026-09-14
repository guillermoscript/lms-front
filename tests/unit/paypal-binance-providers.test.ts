import { afterEach, describe, it, expect, vi } from 'vitest'
import crypto from 'crypto'
import {
  PayPalPaymentProvider,
  encodePayPalCustomId,
  decodePayPalCustomId,
  encodePayPalPlatformCustomId,
  PAYPAL_CUSTOM_ID_MAX_LENGTH,
} from '@/lib/payments/paypal-provider'
import { BinancePayProvider } from '@/lib/payments/binance-provider'
import { PROVIDER_CAPABILITIES } from '@/lib/payments/types'
import { SWITCH_METADATA_KEY } from '@/lib/billing/platform-subscription-switch'

afterEach(() => vi.unstubAllGlobals())

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
// PayPal platform (school → platform) custom_id encode/decode (#744)
// ---------------------------------------------------------------------------

describe('encodePayPalPlatformCustomId / decodePayPalCustomId (platform loop)', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001'
  const planId = '11111111-1111-1111-1111-111111111111'
  const switchId = '22222222-2222-2222-2222-222222222222'

  it('round-trips tenant_id/plan_id/interval without a switch id', () => {
    const encoded = encodePayPalPlatformCustomId({ tenant_id: tenantId, plan_id: planId, interval: 'monthly' })
    expect(encoded.startsWith('plt|')).toBe(true)
    const decoded = decodePayPalCustomId(encoded)
    expect(decoded.reference).toBe(`platform:${tenantId}:${planId}`)
    expect(decoded.metadata).toEqual({ tenant_id: tenantId, plan_id: planId, interval: 'monthly' })
  })

  it('round-trips a pending switch id under the SWITCH_METADATA_KEY imported from platform-subscription-switch', () => {
    // Pins the paypal-provider's own private packing key to the public
    // constant the checkout route and dispatcher read (comment in
    // paypal-provider.ts says a test does exactly this).
    const encoded = encodePayPalPlatformCustomId({
      tenant_id: tenantId,
      plan_id: planId,
      interval: 'yearly',
      [SWITCH_METADATA_KEY]: switchId,
    })
    const decoded = decodePayPalCustomId(encoded)
    expect(decoded.metadata?.interval).toBe('yearly')
    expect(decoded.metadata?.[SWITCH_METADATA_KEY]).toBe(switchId)
  })

  it('stays within the 127-char limit at the worst case — three UUIDs packed together', () => {
    const encoded = encodePayPalPlatformCustomId({
      tenant_id: tenantId,
      plan_id: planId,
      interval: 'monthly',
      [SWITCH_METADATA_KEY]: switchId,
    })
    expect(encoded.length).toBeLessThanOrEqual(PAYPAL_CUSTOM_ID_MAX_LENGTH)
  })

  it('throws rather than truncate a custom_id over the 127-char limit', () => {
    const longPlanId = 'a'.repeat(100)
    expect(() =>
      encodePayPalPlatformCustomId({ tenant_id: tenantId, plan_id: longPlanId, interval: 'monthly' }),
    ).toThrow(/127/)
  })

  it('throws when tenant_id is missing — never checkout with a half-formed correlation', () => {
    expect(() => encodePayPalPlatformCustomId({ plan_id: planId })).toThrow(/tenant_id/)
  })

  it('a decoded platform id carries no userId/tenantId — the student owner-binding guard fails closed on it', () => {
    const decoded = decodePayPalCustomId(encodePayPalPlatformCustomId({ tenant_id: tenantId, plan_id: planId }))
    expect(decoded.metadata?.userId).toBeUndefined()
    expect(decoded.metadata?.tenantId).toBeUndefined()
  })

  it('a decoded STUDENT id still carries no tenant_id/plan_id — the platform student-loop guard drops it', () => {
    const decoded = decodePayPalCustomId(encodePayPalCustomId('42', { userId: 'u1', tenantId }))
    expect(decoded.metadata?.tenant_id).toBeUndefined()
    expect(decoded.metadata?.plan_id).toBeUndefined()
    expect(decoded.metadata).toEqual({ userId: 'u1', tenantId })
  })
})

describe('PayPalPaymentProvider.normalizeWebhookEvent — platform activation', () => {
  it('BILLING.SUBSCRIPTION.ACTIVATED with a platform custom_id normalizes to tenant_id/plan_id/interval metadata', async () => {
    const provider = new PayPalPaymentProvider('client', 'secret', 'wh-id', 'sandbox')
    const tenantId = '00000000-0000-0000-0000-000000000001'
    const planId = '11111111-1111-1111-1111-111111111111'
    const customId = encodePayPalPlatformCustomId({ tenant_id: tenantId, plan_id: planId, interval: 'yearly' })

    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-platform-1',
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: {
          id: 'I-PLATFORM-1',
          custom_id: customId,
          billing_info: { next_billing_time: '2026-08-19T00:00:00Z' },
        },
      }),
    )
    expect(event).toMatchObject({
      type: 'subscription.activated',
      providerSubscriptionId: 'I-PLATFORM-1',
      reference: `platform:${tenantId}:${planId}`,
      metadata: { tenant_id: tenantId, plan_id: planId, interval: 'yearly' },
    })
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
    // The dispatcher binds the refund to the sale's owner with these (#743).
    expect(event?.metadata).toEqual({ userId: 'user-uuid', tenantId: 'tenant-uuid' })
  })

  // A denied capture left the checkout pending with no signal (#479).
  it('maps PAYMENT.CAPTURE.DENIED / DECLINED → payment.failed with owner metadata', async () => {
    for (const ppType of ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED']) {
      const event = await provider.normalizeWebhookEvent(
        JSON.stringify({ id: 'WH-D', event_type: ppType, resource: { id: 'CAP-D', custom_id: customId } }),
      )
      expect(event).toMatchObject({
        type: 'payment.failed',
        providerPaymentId: 'CAP-D',
        reference: '42',
        metadata: { userId: 'user-uuid', tenantId: 'tenant-uuid' },
      })
    }
  })

  it('maps BILLING.SUBSCRIPTION.RE-ACTIVATED like ACTIVATED', async () => {
    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-R',
        event_type: 'BILLING.SUBSCRIPTION.RE-ACTIVATED',
        resource: { id: 'I-SUB1', custom_id: customId, billing_info: { next_billing_time: '2026-10-01T00:00:00Z' } },
      }),
    )
    expect(event).toMatchObject({ type: 'subscription.activated', providerSubscriptionId: 'I-SUB1', reference: '42' })
  })

  // The sale echoes the subscription's custom_id as `custom` (seen live) — the
  // owner binding needs it even when the subscription fetch fails.
  it('decodes a renewal sale owner from resource.custom when the subscription fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const event = await provider.normalizeWebhookEvent(
      JSON.stringify({
        id: 'WH-S',
        event_type: 'PAYMENT.SALE.COMPLETED',
        resource: { id: 'S-2', billing_agreement_id: 'I-SUB1', custom: customId, amount: { total: '9.00', currency: 'USD' } },
      }),
    )
    expect(event).toMatchObject({
      type: 'subscription.renewed',
      providerSubscriptionId: 'I-SUB1',
      reference: '42',
      metadata: { userId: 'user-uuid', tenantId: 'tenant-uuid' },
    })
    vi.unstubAllGlobals()
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
        data: JSON.stringify({ merchantTradeNo: '42', refundInfo: { prepayId: 'prepay-9' } }),
      }),
    )
    // No passThroughInfo on a refund notification, so the ORDER's prepayId —
    // what checkout stored on the row — is the owner binding (#743).
    expect(refund).toMatchObject({ type: 'refund.succeeded', reference: '42', providerPaymentId: 'prepay-9' })
    expect(refund?.metadata).toBeUndefined()
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

describe('PayPalPaymentProvider.cancelSubscription', () => {
  function stubPayPal(cancelStatus: number, body?: string) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: cancelStatus >= 200 && cancelStatus < 300,
        status: cancelStatus,
        text: async () => body ?? (cancelStatus === 404 ? 'missing' : 'provider failure'),
      })
    vi.stubGlobal('fetch', fetchMock)
  }

  // A second cancel (payer already cancelled in PayPal) is a 422, not a 404 —
  // seen live. Throwing kept switch cleanup retrying forever (#479).
  it('treats 422 SUBSCRIPTION_STATUS_INVALID as already canceled', async () => {
    stubPayPal(422, '{"name":"UNPROCESSABLE_ENTITY","details":[{"issue":"SUBSCRIPTION_STATUS_INVALID"}]}')
    const provider = new PayPalPaymentProvider('client', 'secret')
    await expect(provider.cancelSubscription('sub-ended', true)).resolves.toEqual({ mode: 'immediate' })
  })

  it('treats a structured HTTP 404 as already canceled', async () => {
    stubPayPal(404)
    const provider = new PayPalPaymentProvider('client', 'secret')
    await expect(provider.cancelSubscription('sub-gone', true)).resolves.toEqual({ mode: 'immediate' })
  })

  it('does not swallow other provider failures', async () => {
    stubPayPal(422)
    const provider = new PayPalPaymentProvider('client', 'secret')
    await expect(provider.cancelSubscription('sub-live', true)).rejects.toThrow(/HTTP 422/)
  })
})

describe('PayPalPaymentProvider.createCheckoutSession — platform vs. student custom_id packing (#744)', () => {
  function stubSubscriptionCreate() {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'token', expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () =>
          JSON.stringify({
            id: 'I-NEW-SUB',
            links: [{ rel: 'approve', href: 'https://paypal.example/approve' }],
          }),
      })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('a hosted (platform) subscription checkout posts a plt| custom_id and an encoded return_url', async () => {
    const fetchMock = stubSubscriptionCreate()
    const provider = new PayPalPaymentProvider('client', 'secret')

    const session = await provider.createCheckoutSession({
      mode: 'subscription',
      hosted: true,
      reference: 'unused-for-platform-packing',
      providerPriceId: 'P-PLAN1',
      amount: 29,
      currency: 'usd',
      successUrl: 'https://school.lvh.me:3000/es/dashboard/admin/billing?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: 'https://school.lvh.me:3000/es/dashboard/admin/billing/upgrade',
      metadata: {
        tenant_id: '00000000-0000-0000-0000-000000000001',
        plan_id: '11111111-1111-1111-1111-111111111111',
        interval: 'monthly',
      },
    })

    expect(session.url).toBe('https://paypal.example/approve')
    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(body.custom_id.startsWith('plt|')).toBe(true)
    // A raw '{' is not a valid URI character — PayPal would reject the whole
    // subscription rather than accept it and mangle the redirect later.
    expect(body.application_context.return_url).not.toMatch(/[{}]/)
    expect(body.application_context.return_url).toContain('%7BCHECKOUT_SESSION_ID%7D')
  })

  it('a non-hosted (student) subscription checkout still posts reference|userId|tenantId', async () => {
    const fetchMock = stubSubscriptionCreate()
    const provider = new PayPalPaymentProvider('client', 'secret')

    await provider.createCheckoutSession({
      mode: 'subscription',
      providerPriceId: 'P-PLAN1',
      amount: 29,
      currency: 'usd',
      reference: '99',
      successUrl: 'https://school.lvh.me:3000/checkout/success',
      metadata: { userId: 'u1', tenantId: '00000000-0000-0000-0000-000000000001' },
    })

    const body = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)
    expect(body.custom_id).toBe('99|u1|00000000-0000-0000-0000-000000000001')
  })

  it('a hosted one_time checkout is refused — platform billing must be a subscription', async () => {
    const provider = new PayPalPaymentProvider('client', 'secret')
    await expect(
      provider.createCheckoutSession({
        mode: 'one_time',
        hosted: true,
        providerPriceId: 'PAYPAL-ONETIME:prod',
        amount: 29,
        currency: 'usd',
        reference: 'x',
      }),
    ).rejects.toThrow(/must be a subscription/)
  })
})

describe('PayPalPaymentProvider.verifyWebhook — fails closed with no webhook id', () => {
  it('returns false and makes no network call when webhookId is the empty string', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    // '' is exactly what platformWebhookSecret() passes when
    // PAYPAL_PLATFORM_WEBHOOK_ID is unset — must not fall back to
    // PAYPAL_WEBHOOK_ID (`??`, not `||`, in the source).
    const provider = new PayPalPaymentProvider('client', 'secret', '')
    const ok = await provider.verifyWebhook('{}', {
      'paypal-transmission-id': 't',
      'paypal-transmission-time': 'x',
      'paypal-transmission-sig': 's',
      'paypal-cert-url': 'https://api.paypal.com/cert',
      'paypal-auth-algo': 'SHA256withRSA',
    })
    expect(ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
