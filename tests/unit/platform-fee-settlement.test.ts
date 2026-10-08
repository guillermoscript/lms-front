import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedBillingEvent } from '@/lib/payments/types'
import { handlePlatformFeeEvent } from '@/lib/billing/platform-fee-settlement'
import { dispatchPlatformBillingEvent } from '@/lib/billing/platform-webhook-dispatch'
import { StripePaymentProvider } from '@/lib/payments/stripe-provider'

/**
 * #929 settlement (design 2.4): the platform webhook loop credits a pay-now
 * payment idempotently through settle_platform_fee_payment (which re-evaluates
 * standing in the same transaction), reverses it on refund / chargeback, and
 * never lets a fee event reach the plan-subscription logic. The SQL side of
 * idempotency, mismatch and reversal is proven in
 * supabase/tests/platform_fee_paynow.test.sql.
 */

const TENANT = '11111111-1111-1111-1111-111111111111'

function fakeAdmin(outcomes: Record<string, unknown> = {}, rpcError: { message: string } | null = null) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = []
  const fromCalls: string[] = []
  const admin = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      return Promise.resolve(rpcError ? { data: null, error: rpcError } : { data: outcomes[fn] ?? null, error: null })
    },
    from: (table: string) => {
      fromCalls.push(table)
      throw new Error(`unexpected table access: ${table}`)
    },
  }
  return { admin: admin as unknown as SupabaseClient, rpcCalls, fromCalls }
}

const feeEvent = (over: Partial<NormalizedBillingEvent> = {}): NormalizedBillingEvent => ({
  type: 'payment.succeeded',
  providerEventId: 'evt_1',
  providerPaymentId: 'pi_1',
  reference: 'pay-1',
  metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: 'pay-1' },
  amount: 25,
  currency: 'usd',
  raw: {},
  ...over,
})

describe('handlePlatformFeeEvent', () => {
  it('settles our pay-now event with the provider-reported amount, currency and charge id', async () => {
    const { admin, rpcCalls } = fakeAdmin({ settle_platform_fee_payment: 'settled' })
    const res = await handlePlatformFeeEvent(feeEvent(), { provider: 'stripe', admin })
    expect(res).toEqual({ handled: true, action: 'settle', outcome: 'settled', paymentId: 'pay-1' })
    expect(rpcCalls).toEqual([
      {
        fn: 'settle_platform_fee_payment',
        args: { _payment_id: 'pay-1', _tenant_id: TENANT, _provider: 'stripe', _provider_charge_id: 'pi_1', _amount: 25, _currency: 'usd' },
      },
    ])
  })

  it('a redelivery (duplicate) and a mismatch are acked, never re-credited or thrown', async () => {
    for (const outcome of ['duplicate', 'mismatch', 'not_pending', 'not_found']) {
      const { admin } = fakeAdmin({ settle_platform_fee_payment: outcome })
      const res = await handlePlatformFeeEvent(feeEvent(), { provider: 'stripe', admin })
      expect(res).toMatchObject({ handled: true, outcome })
    }
  })

  it('a missing amount is passed as NULL so the SQL flags it (no "assume full" fallback)', async () => {
    const { admin, rpcCalls } = fakeAdmin({ settle_platform_fee_payment: 'mismatch' })
    await handlePlatformFeeEvent(feeEvent({ amount: undefined }), { provider: 'stripe', admin })
    expect(rpcCalls[0].args._amount).toBeNull()
  })

  it('a fee event without its ids credits nothing and does not call the DB', async () => {
    const { admin, rpcCalls } = fakeAdmin()
    const res = await handlePlatformFeeEvent(feeEvent({ metadata: { kind: 'platform_fee' }, reference: undefined }), { provider: 'stripe', admin })
    expect(res).toMatchObject({ handled: true, outcome: 'not_found' })
    expect(rpcCalls).toHaveLength(0)
  })

  it('a DB error throws so the webhook route 500s and the provider retries', async () => {
    const { admin } = fakeAdmin({}, { message: 'connection reset' })
    await expect(handlePlatformFeeEvent(feeEvent(), { provider: 'stripe', admin })).rejects.toThrow('connection reset')
  })

  it('ignores payment.succeeded that is not ours', async () => {
    const { admin, rpcCalls } = fakeAdmin()
    const res = await handlePlatformFeeEvent(feeEvent({ metadata: { tenantId: TENANT, userId: 'u' } }), { provider: 'stripe', admin })
    expect(res).toEqual({ handled: false })
    expect(rpcCalls).toHaveLength(0)
  })

  it('refund and chargeback reverse a credited fee payment by charge id', async () => {
    const { admin, rpcCalls } = fakeAdmin({ reverse_platform_fee_payment_by_charge: 'reversed' })
    expect(await handlePlatformFeeEvent(feeEvent({ type: 'refund.succeeded', metadata: undefined }), { provider: 'stripe', admin }))
      .toEqual({ handled: true, action: 'reverse', outcome: 'reversed' })
    expect(await handlePlatformFeeEvent(feeEvent({ type: 'payment.disputed', metadata: undefined }), { provider: 'stripe', admin }))
      .toMatchObject({ handled: true, action: 'reverse' })
    expect(rpcCalls.map((c) => c.args._reason)).toEqual(['refund', 'chargeback'])
    expect(rpcCalls[0].args).toMatchObject({ _provider: 'stripe', _provider_charge_id: 'pi_1' })
  })

  it('a refund that is not a fee payment is left to the caller', async () => {
    const { admin } = fakeAdmin({ reverse_platform_fee_payment_by_charge: 'not_found' })
    expect(await handlePlatformFeeEvent(feeEvent({ type: 'refund.succeeded', metadata: undefined }), { provider: 'stripe', admin }))
      .toEqual({ handled: false })
  })
})

describe('dispatchPlatformBillingEvent — fee branch', () => {
  it('a fee settlement never touches the plan subscription tables', async () => {
    const { admin, fromCalls } = fakeAdmin({ settle_platform_fee_payment: 'settled' })
    await dispatchPlatformBillingEvent(feeEvent(), { provider: 'stripe', admin })
    expect(fromCalls).toHaveLength(0)
  })

  it('a non-fee refund / chargeback is still dropped as student-loop vocabulary', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { admin, fromCalls } = fakeAdmin({ reverse_platform_fee_payment_by_charge: 'not_found' })
    await dispatchPlatformBillingEvent(feeEvent({ type: 'refund.succeeded', metadata: undefined }), { provider: 'stripe', admin })
    await dispatchPlatformBillingEvent(feeEvent({ type: 'payment.disputed', metadata: undefined }), { provider: 'stripe', admin })
    expect(fromCalls).toHaveLength(0)
    log.mockRestore()
  })
})

describe('StripePaymentProvider.normalizeWebhookEvent — fee pay-now events', () => {
  const p = new StripePaymentProvider('sk_test_dummy')
  const ev = (type: string, object: Record<string, unknown>) => JSON.stringify({ id: 'evt_9', type, data: { object } })

  it('a paid fee Checkout Session becomes payment.succeeded in MAJOR units', async () => {
    const e = await p.normalizeWebhookEvent(
      ev('checkout.session.completed', {
        mode: 'payment',
        payment_status: 'paid',
        payment_intent: 'pi_9',
        amount_total: 1999,
        currency: 'USD',
        metadata: { kind: 'platform_fee', tenant_id: TENANT, payment_id: 'pay-9' },
      }),
    )
    expect(e).toMatchObject({ type: 'payment.succeeded', providerPaymentId: 'pi_9', reference: 'pay-9', amount: 19.99, currency: 'usd' })
  })

  it('an unpaid (delayed) session waits for async_payment_succeeded', async () => {
    const obj = { mode: 'payment', payment_status: 'unpaid', payment_intent: 'pi_9', amount_total: 100, currency: 'usd', metadata: { kind: 'platform_fee' } }
    expect(await p.normalizeWebhookEvent(ev('checkout.session.completed', obj))).toBeNull()
    expect(await p.normalizeWebhookEvent(ev('checkout.session.async_payment_succeeded', { ...obj, payment_status: 'paid' })))
      .toMatchObject({ type: 'payment.succeeded' })
  })

  it('other one-time sessions stay unmodelled; subscription sessions still activate', async () => {
    expect(await p.normalizeWebhookEvent(ev('checkout.session.completed', { mode: 'payment', payment_status: 'paid', metadata: {} }))).toBeNull()
    expect(await p.normalizeWebhookEvent(ev('checkout.session.completed', { mode: 'subscription', subscription: 'sub_1', metadata: {} })))
      .toMatchObject({ type: 'subscription.activated', providerSubscriptionId: 'sub_1' })
    expect(await p.normalizeWebhookEvent(ev('checkout.session.async_payment_succeeded', { mode: 'subscription', subscription: 'sub_1' }))).toBeNull()
  })

  it('a chargeback whose funds left the account is payment.disputed', async () => {
    expect(await p.normalizeWebhookEvent(ev('charge.dispute.funds_withdrawn', { payment_intent: 'pi_9', amount: 1999 })))
      .toMatchObject({ type: 'payment.disputed', providerPaymentId: 'pi_9' })
  })
})
