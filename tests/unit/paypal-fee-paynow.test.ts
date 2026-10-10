import { afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/billing/access-cutoff', () => ({
  reconcileAccessCutoffSafely: () => Promise.resolve(),
  reconcileAccessCutoff: () => Promise.resolve({ action: 'none' }),
}))
vi.mock('@/lib/email/send', () => ({ sendEmail: () => Promise.resolve() }))

import {
  PayPalPaymentProvider,
  encodePayPalCustomId,
  encodePayPalFeeCustomId,
  encodePayPalPlatformCustomId,
  decodePayPalCustomId,
} from '@/lib/payments/paypal-provider'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import type { NormalizedBillingEvent } from '@/lib/payments/types'

afterEach(() => vi.unstubAllGlobals())

/** #950 — PayPal one-off Order platform-fee pay-now. */

const TENANT = '00000000-0000-0000-0000-000000000001'
const PAYMENT = '33333333-3333-3333-3333-333333333333'
const feeMeta = { kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT }

describe('fee custom_id', () => {
  it('round-trips tenant + payment with no userId', () => {
    const encoded = encodePayPalFeeCustomId(feeMeta)
    expect(encoded).toBe(`fee|${TENANT}|${PAYMENT}`)
    expect(encoded.length).toBeLessThanOrEqual(127)
    const decoded = decodePayPalCustomId(encoded)
    expect(decoded.reference).toBe(`platform_fee:${TENANT}:${PAYMENT}`)
    expect(decoded.metadata).toEqual(feeMeta)
    expect(decoded.metadata).not.toHaveProperty('userId')
  })

  it('rejects "|" and missing fields', () => {
    expect(() => encodePayPalFeeCustomId({ tenant_id: 'a|b', payment_id: PAYMENT })).toThrow(/"\|"/)
    expect(() => encodePayPalFeeCustomId({ tenant_id: TENANT })).toThrow()
  })

  it('does not collide with student or plan custom_ids', () => {
    const student = decodePayPalCustomId(encodePayPalCustomId('12345', { userId: 'u', tenantId: TENANT }))
    expect(student.metadata?.kind).toBeUndefined()
    const plan = decodePayPalCustomId(
      encodePayPalPlatformCustomId({ tenant_id: TENANT, plan_id: PAYMENT, interval: 'monthly' }),
    )
    expect(plan.metadata?.kind).toBeUndefined()
    expect(plan.reference).toMatch(/^platform:/)
  })
})

describe('createCheckoutSession — fee order', () => {
  const provider = new PayPalPaymentProvider('client', 'secret', 'wh-id', 'sandbox')

  function stubFetch() {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        const body = url.includes('/oauth2/token')
          ? { access_token: 't', expires_in: 3600 }
          : { id: 'ORDER-1', links: [{ rel: 'payer-action', href: 'https://paypal.test/approve' }] }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    return calls
  }

  const params = {
    mode: 'one_time' as const,
    hosted: true,
    providerPriceId: '',
    reference: `platform_fee:${TENANT}:${PAYMENT}`,
    amount: 12.5,
    currency: 'usd',
    successUrl: 'https://s.lvh.me/en/dashboard/admin/earnings?fee_payment=' + PAYMENT,
    cancelUrl: 'https://s.lvh.me/en/dashboard/admin/earnings',
    baseUrl: 'https://s.lvh.me',
    metadata: feeMeta,
  }

  it('advertises pay-now support', () => {
    expect(provider.capabilities.supportsPlatformFeePayNow).toBe(true)
  })

  it('creates an order in major units, idempotent, returning to the fee capture route', async () => {
    const calls = stubFetch()
    const session = await provider.createCheckoutSession(params)
    expect(session.providerRef).toBe('ORDER-1')
    const order = calls.find((c) => c.url.endsWith('/v2/checkout/orders'))!
    const headers = order.init!.headers as Record<string, string>
    expect(headers['PayPal-Request-Id']).toBe(`platform_fee:${PAYMENT}`)
    const body = JSON.parse(order.init!.body as string)
    expect(body.purchase_units[0].amount).toEqual({ currency_code: 'USD', value: '12.50' })
    expect(body.purchase_units[0].custom_id).toBe(`fee|${TENANT}|${PAYMENT}`)
    expect(body.payment_source.paypal.experience_context.return_url).toContain(
      'https://s.lvh.me/api/billing/fees/paypal/capture?next=',
    )
  })

  it('still refuses a hosted one-time order that is not a fee payment', async () => {
    stubFetch()
    await expect(
      provider.createCheckoutSession({ ...params, metadata: { tenant_id: TENANT } }),
    ).rejects.toThrow(/must be a subscription/)
  })

  it('captures with a capture-scoped request id and reports amount + currency', async () => {
    const calls: { url: string; init?: RequestInit }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init })
        const body = url.includes('/oauth2/token')
          ? { access_token: 't', expires_in: 3600 }
          : {
              status: 'COMPLETED',
              purchase_units: [
                {
                  custom_id: `fee|${TENANT}|${PAYMENT}`,
                  payments: {
                    captures: [
                      { id: 'CAP-1', status: 'COMPLETED', amount: { value: '12.50', currency_code: 'USD' } },
                    ],
                  },
                },
              ],
            }
        return new Response(JSON.stringify(body), { status: 200 })
      }),
    )
    const captured = await provider.captureOrder('ORDER-1')
    const call = calls.find((c) => c.url.endsWith('/capture'))!
    expect((call.init!.headers as Record<string, string>)['PayPal-Request-Id']).toBe('capture:ORDER-1')
    expect(captured).toMatchObject({
      captureId: 'CAP-1',
      captureStatus: 'COMPLETED',
      amount: 12.5,
      currency: 'usd',
      metadata: feeMeta,
    })
  })
})

describe('normalizeWebhookEvent — PAYMENT.CAPTURE.COMPLETED', () => {
  const provider = new PayPalPaymentProvider('client', 'secret', 'wh-id', 'sandbox')
  const normalize = (resource: Record<string, unknown>) =>
    provider.normalizeWebhookEvent(
      JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource }),
    )

  it('carries amount (major units) and lowercase currency', async () => {
    const event = await normalize({
      id: 'CAP-1',
      custom_id: `fee|${TENANT}|${PAYMENT}`,
      amount: { value: '12.50', currency_code: 'USD' },
    })
    expect(event).toMatchObject({
      type: 'payment.succeeded',
      providerPaymentId: 'CAP-1',
      reference: `platform_fee:${TENANT}:${PAYMENT}`,
      metadata: feeMeta,
      amount: 12.5,
      currency: 'usd',
    })
  })

  it('omits amount when the payload has none', async () => {
    const event = await normalize({ id: 'CAP-2', custom_id: '77|u|t' })
    expect(event).not.toHaveProperty('amount')
  })
})

describe('dispatchers', () => {
  const feeEvent: NormalizedBillingEvent = {
    type: 'payment.succeeded',
    providerEventId: 'platform-paypal-capture:CAP-1',
    providerPaymentId: 'CAP-1',
    reference: `platform_fee:${TENANT}:${PAYMENT}`,
    metadata: feeMeta,
    amount: 12.5,
    currency: 'usd',
    raw: {},
  }

  it('platform dispatcher settles a fee capture through settle_platform_fee_payment', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'settled', error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = { rpc, from: () => { throw new Error('no table access expected') } } as any
    await dispatchPlatformBillingEvent(feeEvent, { provider: 'paypal', admin })
    expect(rpc).toHaveBeenCalledWith('settle_platform_fee_payment', {
      _payment_id: PAYMENT,
      _tenant_id: TENANT,
      _provider: 'paypal',
      _provider_charge_id: 'CAP-1',
      _amount: 12.5,
      _currency: 'usd',
    })
  })

  it('student dispatcher ignores a fee capture and touches nothing (fails closed)', async () => {
    const rpc = vi.fn()
    const from = vi.fn(() => { throw new Error('student loop must not query') })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = { rpc, from } as any
    await expect(dispatchBillingEvent(feeEvent, { provider: 'paypal', admin })).resolves.toBeUndefined()
    expect(from).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })
})
