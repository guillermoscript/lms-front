import { describe, it, expect } from 'vitest'
import {
  BinancePayProvider,
  buildPassThrough,
} from '@/lib/payments/binance-provider'

const TENANT = '550e8400-e29b-41d4-a716-446655440000'
const PAYMENT = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
const USER = '123e4567-e89b-12d3-a456-426614174000'

const provider = new BinancePayProvider('k', 's')

function webhook(
  bizType: string,
  bizStatus: string,
  data: Record<string, unknown>,
  bizId = 'PREPAY1',
) {
  return JSON.stringify({ bizType, bizStatus, bizIdStr: bizId, data: JSON.stringify(data) })
}

describe('buildPassThrough (fee pay-now)', () => {
  it('keeps kind + payment_id with real UUIDs, <=512, no plan_id', () => {
    const bag = buildPassThrough(
      {
        reference: `platform_fee:${TENANT}:${PAYMENT}`,
        amount: 10,
        currency: 'usd',
        metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT, userId: USER, tenantId: TENANT },
      } as never,
      'p' + 'a'.repeat(30),
    )
    expect(bag.kind).toBe('platform_fee')
    expect(bag.payment_id).toBe(PAYMENT)
    expect(bag.tenant_id).toBe(TENANT)
    expect(bag.plan_id).toBeUndefined()
    expect(JSON.stringify(bag).length).toBeLessThanOrEqual(512)
  })

  it('drops ref before kind/payment_id when oversized', () => {
    const bag = buildPassThrough(
      {
        reference: 'r'.repeat(300),
        amount: 10,
        currency: 'usd',
        metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT, userId: USER, tenantId: TENANT },
      } as never,
      'p' + 'a'.repeat(30),
    )
    expect(bag.kind).toBe('platform_fee')
    expect(bag.payment_id).toBe(PAYMENT)
    expect(bag.ref).toBeUndefined()
    expect(JSON.stringify(bag).length).toBeLessThanOrEqual(512)
  })
})

describe('normalizeWebhookEvent PAY_SUCCESS (fee)', () => {
  const pass = JSON.stringify({ kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT })

  it('carries amount, usd currency and metadata; string amount, USDT -> usd', async () => {
    const ev = await provider.normalizeWebhookEvent(
      webhook('PAY', 'PAY_SUCCESS', {
        orderAmount: '12.50',
        totalFee: '99',
        currency: 'USDT',
        prepayId: 'PREPAY1',
        passThroughInfo: pass,
      }),
    )
    expect(ev?.type).toBe('payment.succeeded')
    expect(ev?.amount).toBe(12.5)
    expect(ev?.currency).toBe('usd')
    expect(ev?.metadata).toMatchObject({ kind: 'platform_fee', tenant_id: TENANT, payment_id: PAYMENT })
  })

  it('falls back to totalFee and accepts numeric amounts', async () => {
    const ev = await provider.normalizeWebhookEvent(
      webhook('PAY', 'PAY_SUCCESS', { totalFee: 7, currency: 'usdt', passThroughInfo: pass }),
    )
    expect(ev?.amount).toBe(7)
    expect(ev?.currency).toBe('usd')
  })

  it('omits amount/currency when absent or invalid', async () => {
    const ev = await provider.normalizeWebhookEvent(
      webhook('PAY', 'PAY_SUCCESS', { orderAmount: 'abc', passThroughInfo: pass }),
    )
    expect(ev).not.toBeNull()
    expect(ev).not.toHaveProperty('amount')
    expect(ev).not.toHaveProperty('currency')
  })

  it('charge id equals the id the refund event reports', async () => {
    const paid = await provider.normalizeWebhookEvent(
      webhook(
        'PAY',
        'PAY_SUCCESS',
        { orderAmount: '5', currency: 'USDT', prepayId: 'PREPAY1', passThroughInfo: pass },
        'BIZ-DIFFERENT',
      ),
    )
    const refund = await provider.normalizeWebhookEvent(
      webhook(
        'PAY_REFUND',
        'REFUND_SUCCESS',
        { prepayId: 'PREPAY1', refundedAmount: '5', currency: 'USDT' },
        'REFUND9',
      ),
    )
    expect(paid?.providerPaymentId).toBe('PREPAY1')
    expect(refund?.providerPaymentId).toBe(paid?.providerPaymentId)
  })
})

describe('plan / product flow unchanged', () => {
  it('plan PAY_SUCCESS stays subscription.activated with bizId and no amount', async () => {
    const ev = await provider.normalizeWebhookEvent(
      webhook('PAY', 'PAY_SUCCESS', {
        orderAmount: '9',
        currency: 'USDT',
        prepayId: 'OTHER',
        passThroughInfo: JSON.stringify({ plan_id: 'p1', tenant_id: TENANT }),
      }),
    )
    expect(ev?.type).toBe('subscription.activated')
    expect(ev?.providerPaymentId).toBe('PREPAY1')
    expect(ev).not.toHaveProperty('amount')
  })

  it('product PAY_SUCCESS keeps bizId and no amount', async () => {
    const ev = await provider.normalizeWebhookEvent(
      webhook('PAY', 'PAY_SUCCESS', {
        orderAmount: '9',
        prepayId: 'OTHER',
        passThroughInfo: JSON.stringify({ productId: 'x' }),
      }),
    )
    expect(ev?.type).toBe('payment.succeeded')
    expect(ev?.providerPaymentId).toBe('PREPAY1')
    expect(ev).not.toHaveProperty('amount')
  })
})
