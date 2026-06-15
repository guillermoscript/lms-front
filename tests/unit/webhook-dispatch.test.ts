import { describe, it, expect } from 'vitest'
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
function makeFakeAdmin(txStatus: string | null = null) {
  const calls: Recorder = { from: [], selects: [], updates: [], rpc: [] }

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
          data: txStatus === null ? null : { transaction_id: 1, status: txStatus },
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
      return Promise.resolve({ data: null, error: null })
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: admin as any, calls }
}

function event(type: BillingEventType, extra: Partial<NormalizedBillingEvent> = {}): NormalizedBillingEvent {
  return { type, raw: {}, ...extra }
}

const PROVIDER = 'lemonsqueezy'

describe('dispatchBillingEvent', () => {
  it('past_due → no subscriptions write and no rpc (log-only)', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('subscription.past_due', { providerSubscriptionId: 'sub_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
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
    expect(calls.rpc[0].fn).toBe('extend_subscription_period')
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
    const { admin, calls } = makeFakeAdmin('pending')
    const periodEnd = new Date('2027-03-01T00:00:00.000Z')
    await dispatchBillingEvent(
      event('subscription.activated', { providerSubscriptionId: 'sub_1', reference: '42', periodEnd }),
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
    expect(calls.rpc[0]?.fn).toBe('extend_subscription_period')
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

  it('refund.succeeded → no writes', async () => {
    const { admin, calls } = makeFakeAdmin()
    await dispatchBillingEvent(event('refund.succeeded', { providerPaymentId: 'pi_1' }), {
      provider: PROVIDER,
      admin,
    })
    expect(calls.updates).toHaveLength(0)
    expect(calls.rpc).toHaveLength(0)
  })
})
