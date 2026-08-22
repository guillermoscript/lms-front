import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import type { NormalizedBillingEvent, BillingEventType } from '@/lib/payments/types'

/**
 * Pins the dispatcher's branching CONTRACT — which Supabase writes each event
 * type makes — not Postgres behavior. The dispatcher takes the admin client as a
 * parameter, so a small fluent fake that records calls is enough.
 */

interface Recorder {
  from: string[]
  selects: { table: string }[]
  updates: { table: string; values: Record<string, unknown> }[]
  rpc: { fn: string; args: Record<string, unknown> }[]
}

/**
 * @param txStatus  what the `transactions` lookup (.maybeSingle()) returns:
 *                  a string → a row with that status; null → no row.
 */
function makeFakeAdmin(txStatus: string | null = null, txExtra: Record<string, unknown> = {}) {
  const calls: Recorder = { from: [], selects: [], updates: [], rpc: [] }
  let rpcRefundedAmount = Number(txExtra.refunded_amount ?? 0)
  const appliedRefundEvents = new Set<string>()

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {
      select(_cols: string) {
        calls.selects.push({ table })
        return builder
      },
      update(values: Record<string, unknown>) {
        calls.updates.push({ table, values })
        return builder
      },
      eq() {
        return builder
      },
      maybeSingle() {
        return Promise.resolve({
          data: txStatus === null ? null : { transaction_id: 1, status: txStatus, ...txExtra },
          error: null,
        })
      },
      // Make the builder awaitable so `await admin.from().update().eq().eq()`
      // resolves to a no-error terminal.
      then(resolve: (v: { data: null; error: null }) => unknown) {
        return Promise.resolve({ data: null, error: null }).then(resolve)
      },
    }
    return builder
  }

  const admin = {
    from(table: string) {
      calls.from.push(table)
      return makeBuilder(table)
    },
    rpc(fn: string, args: Record<string, unknown>) {
      calls.rpc.push({ fn, args })
      if (fn === 'apply_webhook_refund') {
        const eventId = String(args._provider_event_id)
        const applied = txStatus === 'successful' && !appliedRefundEvents.has(eventId)
        if (applied) {
          appliedRefundEvents.add(eventId)
          rpcRefundedAmount = Math.min(
            Number(txExtra.amount ?? 0),
            rpcRefundedAmount + Number(args._refund_amount ?? 0),
          )
          const full = rpcRefundedAmount >= Number(txExtra.amount ?? 0) - 0.005
          calls.updates.push({
            table: 'transactions',
            values: { status: full ? 'refunded' : 'successful', refunded_amount: rpcRefundedAmount },
          })
          if (full && txExtra.product_id) {
            calls.updates.push({ table: 'entitlements', values: { status: 'revoked' } })
          }
        }
        return Promise.resolve({
          data: [{
            applied,
            refunded_amount: rpcRefundedAmount,
            is_full_refund: rpcRefundedAmount >= Number(txExtra.amount ?? 0) - 0.005,
            user_id: txExtra.user_id,
            product_id: txExtra.product_id,
            plan_id: txExtra.plan_id,
          }],
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }

  return {
    admin: admin as unknown as SupabaseClient,
    calls,
    refundState: {
      get amount() { return rpcRefundedAmount },
      appliedRefundEvents,
    },
  }
}

function event(type: BillingEventType, extra: Partial<NormalizedBillingEvent> = {}): NormalizedBillingEvent {
  return { type, providerEventId: 'evt-default', raw: {}, ...extra }
}

const PROVIDER = 'lemonsqueezy'

describe('dispatchBillingEvent', () => {
  // The dispatcher used to log past_due and drop it, on a stale comment
  // claiming the enum had no such value —
  // 20260530140000_add_past_due_subscription_status.sql added it, so a student
  // mid-dunning looked healthy everywhere (#545).
  it('past_due → writes subscription_status="past_due" (access untouched)', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.past_due', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].table).toBe('subscriptions')
    expect(calls.updates[0].values).toEqual({ subscription_status: 'past_due' })
    // No ended_at / entitlement change — handle_subscription_status_change
    // matches neither branch for past_due, so access rides out the retry window.
    expect(calls.rpc).toHaveLength(0)
  })

  it('past_due without a provider subscription id → no write', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.past_due'), { provider: PROVIDER, admin })
    expect(calls.updates).toHaveLength(0)
    expect(calls.from).toHaveLength(0)
  })

  it('canceled → updates subscriptions with subscription_status="canceled"', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.canceled', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].table).toBe('subscriptions')
    expect(calls.updates[0].values.subscription_status).toBe('canceled')
    expect(calls.updates[0].values.ended_at).toBeTypeOf('string')
    expect(calls.rpc).toHaveLength(0)
  })

  it('expired → updates subscriptions with subscription_status="expired"', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.expired', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(1)
    expect(calls.updates[0].values.subscription_status).toBe('expired')
  })

  it('renewed with periodEnd → calls extend_subscription_period with ISO end', async () => {
    const { admin, calls } = makeFakeAdmin()
    const periodEnd = new Date('2027-01-01T00:00:00.000Z')
    await dispatchBillingEvent(
      event('subscription.renewed', { providerSubscriptionId: 'sub_1', periodEnd }),
      { provider: PROVIDER, admin },
    )
    expect(calls.rpc).toHaveLength(1)
    expect(calls.rpc[0].fn).toBe('apply_webhook_subscription_period')
    expect(calls.rpc[0].args).toMatchObject({
      _provider_subscription_id: 'sub_1',
      _provider: PROVIDER,
      _new_period_end: periodEnd.toISOString(),
    })
    expect(calls.updates).toHaveLength(0)
  })

  it('renewed WITHOUT periodEnd → no rpc, no write (cannot extend access)', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.renewed', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.rpc).toHaveLength(0)
    expect(calls.updates).toHaveLength(0)
  })

  it('renewed without a subId → no-op', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.renewed', { periodEnd: new Date('2027-01-01T00:00:00.000Z') }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.rpc).toHaveLength(0)
    expect(calls.updates).toHaveLength(0)
  })

  it('activated with pending transaction reference → flips tx to successful + aligns period', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'u1', tenant_id: 't1' })
    const periodEnd = new Date('2027-03-01T00:00:00.000Z')
    await dispatchBillingEvent(
      event('subscription.activated', {
        providerSubscriptionId: 'sub_1',
        reference: '42',
        periodEnd,
        metadata: { userId: 'u1', tenantId: 't1' },
      }),
      { provider: PROVIDER, admin },
    )
    // Looked up the transaction, then flipped it.
    expect(calls.selects.some((s) => s.table === 'transactions')).toBe(true)
    const txUpdate = calls.updates.find((u) => u.table === 'transactions')
    expect(txUpdate?.values).toMatchObject({
      status: 'successful',
      provider_subscription_id: 'sub_1',
      payment_provider: PROVIDER,
    })
    // Period aligned via the RPC.
    expect(calls.rpc[0]?.fn).toBe('apply_webhook_subscription_period')
  })

  it('activated: metadata owner MATCHES the transaction → flips (M1)', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'u1', tenant_id: 't1' })
    await dispatchBillingEvent(
      event('subscription.activated', {
        providerSubscriptionId: 'sub_1',
        reference: '42',
        periodEnd: new Date('2027-03-01T00:00:00.000Z'),
        metadata: { userId: 'u1', tenantId: 't1' },
      }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toMatchObject({
      status: 'successful',
    })
  })

  it('activated: metadata owner MISMATCH → refuses to flip another user\'s tx (M1)', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'victim', tenant_id: 't1' })
    await expect(
      dispatchBillingEvent(
        event('subscription.activated', {
          providerSubscriptionId: 'sub_1',
          reference: '42',
          periodEnd: new Date('2027-03-01T00:00:00.000Z'),
          metadata: { userId: 'attacker', tenantId: 't1' },
        }),
        { provider: PROVIDER, admin },
      ),
    ).rejects.toThrow(/owner mismatch/i)
    // No transaction flip happened.
    expect(calls.updates.find((u) => u.table === 'transactions')).toBeUndefined()
  })

  it('activated: metadata MISSING entirely → fails closed, does not flip (#347)', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'u1', tenant_id: 't1' })
    await expect(
      dispatchBillingEvent(
        event('subscription.activated', {
          providerSubscriptionId: 'sub_1',
          reference: '42',
          periodEnd: new Date('2027-03-01T00:00:00.000Z'),
        }),
        { provider: PROVIDER, admin },
      ),
    ).rejects.toThrow(/owner mismatch/i)
    expect(calls.updates.find((u) => u.table === 'transactions')).toBeUndefined()
  })

  it('activated for an existing row (subId, no reference) → sets subscription active', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.activated', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    const subUpdate = calls.updates.find((u) => u.table === 'subscriptions')
    expect(subUpdate?.values.subscription_status).toBe('active')
  })

  it('payment.succeeded → no writes (owned by provider-specific routes)', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('payment.succeeded', { providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
  })

  it('payment.succeeded: matched one-time tx with matching metadata → flips to successful', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'u1', tenant_id: 't1', plan_id: null, product_id: 99 })
    await dispatchBillingEvent(
      event('payment.succeeded', {
        providerPaymentId: 'pi_1',
        reference: '42',
        metadata: { userId: 'u1', tenantId: 't1' },
      }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toMatchObject({ status: 'successful' })
  })

  it('payment.succeeded: matched one-time tx but metadata MISSING → fails closed (#347)', async () => {
    const { admin, calls } = makeFakeAdmin('pending', { user_id: 'u1', tenant_id: 't1', plan_id: null, product_id: 99 })
    await expect(
      dispatchBillingEvent(
        event('payment.succeeded', { providerPaymentId: 'pi_1', reference: '42' }),
        { provider: PROVIDER, admin },
      ),
    ).rejects.toThrow(/owner mismatch/i)
    expect(calls.updates.find((u) => u.table === 'transactions')).toBeUndefined()
  })

  it('refund.succeeded without a reference → no writes', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('refund.succeeded', { providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
  })

  it('refund.succeeded on a product purchase → flips tx to refunded AND revokes the product entitlements', async () => {
    const { admin, calls } = makeFakeAdmin('successful', { user_id: 'u1', product_id: 7, plan_id: null })
    await dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toMatchObject({ status: 'refunded' })
    expect(calls.updates.find((u) => u.table === 'entitlements')?.values).toMatchObject({ status: 'revoked' })
  })

  it('refund.succeeded on a SUBSCRIPTION purchase → flips tx to refunded so payouts claw it back (#515)', async () => {
    // Regression for #515: a plan row (product_id null, plan_id set) used to exit
    // the handler untouched, so `getPayoutsOwed()` kept counting a refunded
    // subscription payment inside `grossOwed` and the school was paid its share
    // of money the platform had already given back.
    const { admin, calls } = makeFakeAdmin('successful', { user_id: 'u1', product_id: null, plan_id: 3 })
    await dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toMatchObject({ status: 'refunded' })
    // Subscription ACCESS stays owned by subscription.canceled/expired — this
    // handler must not revoke entitlements for a plan row.
    expect(calls.updates.find((u) => u.table === 'entitlements')).toBeUndefined()
  })

  it('refund.succeeded on an already-refunded tx → no writes (idempotent redelivery)', async () => {
    const { admin, calls } = makeFakeAdmin('refunded', { user_id: 'u1', product_id: null, plan_id: 3 })
    await dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
  })

  it('refund replay on a refunded product cannot revoke a later re-purchase entitlement', async () => {
    const { admin, calls } = makeFakeAdmin('refunded', {
      user_id: 'u1', product_id: 7, plan_id: null, amount: 100, refunded_amount: 100,
    })
    await dispatchBillingEvent(event('refund.succeeded', {
      providerEventId: 'late-refund-delivery', reference: '42', amount: 100,
    }), { provider: PROVIDER, admin })

    expect(calls.updates).toHaveLength(0)
  })

  it('refund on a pending transaction fails so the webhook claim can retry', async () => {
    const { admin } = makeFakeAdmin('pending', {
      user_id: 'u1', product_id: 7, plan_id: null, amount: 100, refunded_amount: 0,
    })
    await expect(dispatchBillingEvent(event('refund.succeeded', {
      providerEventId: 'early-refund', reference: '42', amount: 10,
    }), { provider: PROVIDER, admin })).rejects.toThrow(/still pending/i)
  })

  it('refund.succeeded on a tx with neither product_id nor plan_id → no writes', async () => {
    const { admin, calls } = makeFakeAdmin('successful', { user_id: 'u1', product_id: null, plan_id: null })
    await dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
  })

  it('refund.succeeded with no matching transaction row → fails for retry', async () => {
    const { admin, calls } = makeFakeAdmin(null)
    await expect(dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER, admin,
    })).rejects.toThrow(/not found/i)
    expect(calls.updates).toHaveLength(0)
  })

  it('payment.failed with reference → flips the abandoned pending tx to failed (frees retry, #479)', async () => {
    // Binance PAY_CLOSED on an abandoned checkout: the pending transaction must
    // be cleared or transactions_unique_product/plan blocks the buyer's retry.
    const { admin, calls } = makeFakeAdmin('pending')
    await dispatchBillingEvent(event('payment.failed', { reference: '42', providerPaymentId: 'ord_1' }), {
      provider: 'binance',
      admin,
    })
    const txUpdate = calls.updates.find((u) => u.table === 'transactions')
    expect(txUpdate?.values).toMatchObject({ status: 'failed' })
    expect(calls.rpc).toHaveLength(0)
  })

  it('payment.failed WITHOUT reference → no write (Lemon Squeezy path)', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('payment.failed', { providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  // #547 §1 — a refund is not all-or-nothing.
  //
  // Every platform-settled provider supports partial refunds, but the dispatcher
  // recorded only a binary status. `computeOwedBalances` then dropped the WHOLE
  // sale out of `grossOwed`: a $10 goodwill refund on a $100 PayPal sale removed
  // $100 from what the school was owed — $72 of under-payment at an 80% split —
  // and revoked the student's course access outright.
  //
  // `event.amount` is always MAJOR units of `event.currency`, normalized by each
  // provider's own mapper (see refund-amount-mapping.test.ts).
  // -------------------------------------------------------------------------

  const SALE = { user_id: 'u1', product_id: 7, plan_id: null, amount: 100, currency: 'usd', refunded_amount: 0 }

  it('#547: a PARTIAL refund records the slice, keeps the row successful, and does NOT revoke access', async () => {
    const { admin, calls } = makeFakeAdmin('successful', SALE)
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 10, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'successful',
      refunded_amount: 10,
    })
    // The student was refunded a tenth of the course, not removed from it.
    expect(calls.updates.find((u) => u.table === 'entitlements')).toBeUndefined()
  })

  it('#547: a FULL refund flips the row and revokes access, as before', async () => {
    const { admin, calls } = makeFakeAdmin('successful', SALE)
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 100, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'refunded',
      refunded_amount: 100,
    })
    expect(calls.updates.find((u) => u.table === 'entitlements')?.values).toMatchObject({ status: 'revoked' })
  })

  it('#547: a second partial refund ACCUMULATES onto the first', async () => {
    const { admin, calls } = makeFakeAdmin('successful', { ...SALE, refunded_amount: 10 })
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 15, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'successful',
      refunded_amount: 25,
    })
    expect(calls.updates.find((u) => u.table === 'entitlements')).toBeUndefined()
  })

  it('#547: partial refunds that together reach the sale total become a FULL refund', async () => {
    const { admin, calls } = makeFakeAdmin('successful', { ...SALE, refunded_amount: 60 })
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 40, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'refunded',
      refunded_amount: 100,
    })
    expect(calls.updates.find((u) => u.table === 'entitlements')?.values).toMatchObject({ status: 'revoked' })
  })

  it('#547: an over-reported refund is CLAMPED to the sale, never past it', async () => {
    // A provider replaying a cumulative total, or plain bad data, must not be
    // able to drive `refunded_amount` above `amount` — that would make the sale
    // read as negative revenue everywhere it is summed.
    const { admin, calls } = makeFakeAdmin('successful', { ...SALE, refunded_amount: 90 })
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 50, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'refunded',
      refunded_amount: 100,
    })
  })

  it('#547: NO amount on the event → treated as a FULL refund (the pre-#547 behaviour)', async () => {
    // The conservative direction when the provider did not tell us: we cannot
    // claim a refund was partial without evidence.
    const { admin, calls } = makeFakeAdmin('successful', SALE)
    await dispatchBillingEvent(event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'refunded',
      refunded_amount: 100,
    })
    expect(calls.updates.find((u) => u.table === 'entitlements')?.values).toMatchObject({ status: 'revoked' })
  })

  it('#547: an amount in a DIFFERENT currency is discarded, not converted', async () => {
    // A figure in another unit of account applied to a balance moves real money.
    // The dispatcher has no rates and must not invent one; provider-specific
    // equivalences (Binance USDT ↔ usd) are resolved in that provider's mapper.
    const errors: unknown[] = []
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => { errors.push(args) })
    const { admin, calls } = makeFakeAdmin('successful', SALE)
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 10, currency: 'eur' }),
      { provider: PROVIDER, admin },
    )
    spy.mockRestore()
    expect(calls.updates.find((u) => u.table === 'transactions')?.values).toEqual({
      status: 'refunded',
      refunded_amount: 100,
    })
    expect(errors).toHaveLength(1)
  })

  it('#547: a fully refunded row is still idempotent on redelivery', async () => {
    const { admin, calls } = makeFakeAdmin('refunded', SALE)
    await dispatchBillingEvent(
      event('refund.succeeded', { reference: '42', providerPaymentId: 'pi_1', amount: 10, currency: 'usd' }),
      { provider: PROVIDER, admin },
    )
    expect(calls.updates).toHaveLength(0)
  })

  it('#625: A,B,A partial-refund replay applies each provider event once', async () => {
    const { admin, calls, refundState } = makeFakeAdmin('successful', {
      ...SALE,
      refunded_amount: 0,
    })
    const refund = (providerEventId: string) =>
      dispatchBillingEvent(
        event('refund.succeeded', {
          providerEventId,
          reference: '42',
          providerPaymentId: 'pi_1',
          amount: 10,
          currency: 'usd',
        }),
        { provider: PROVIDER, admin },
      )

    await refund('refund-A')
    await refund('refund-B')
    await refund('refund-A')

    expect(calls.updates.filter((update) => update.table === 'transactions')).toHaveLength(2)
    expect(refundState.amount).toBe(20)
    expect(refundState.appliedRefundEvents.size).toBe(2)
  })
})
