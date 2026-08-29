import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  checkoutExpiresAt,
  isHostedCheckoutProvider,
  checkoutTtlMinutes,
  DEFAULT_CHECKOUT_TTL_MINUTES,
} from '@/lib/payments/checkout-expiry'
import { dispatchBillingEvent } from '@/lib/payments/webhook-dispatch'
import type { NormalizedBillingEvent } from '@/lib/payments/types'

/**
 * The TTL contract and the late-settlement window it opens (issue #624).
 *
 * Expiring an abandoned checkout is only safe because a provider success that
 * lands afterwards can still be settled. These two halves are tested together
 * because the second is what makes the first defensible: without revival, this
 * feature would take a buyer's money and give them nothing.
 */

describe('hosted checkout TTL', () => {
  const original = process.env.CHECKOUT_TTL_MINUTES
  afterEach(() => {
    if (original === undefined) delete process.env.CHECKOUT_TTL_MINUTES
    else process.env.CHECKOUT_TTL_MINUTES = original
  })

  // Gated on the capability, never the provider name: the hazard is "we
  // redirect away and may never hear back", which is what the flag records.
  it.each(['paypal', 'lemonsqueezy', 'binance'])('%s redirects away → gets a TTL', provider => {
    expect(isHostedCheckoutProvider(provider)).toBe(true)
    expect(checkoutExpiresAt(provider)).toBeTypeOf('string')
  })

  // Stripe confirms client-side with Elements, Solana Pay is polled by our own
  // verify endpoint, manual is an offline payment request. None of them can be
  // abandoned mid-redirect, and a TTL on them would cancel live payments.
  it.each(['stripe', 'solana', 'solana_subs', 'manual', 'binance_personal'])(
    '%s settles in-band → no TTL, so it never enters the reconciler queue',
    provider => {
      expect(isHostedCheckoutProvider(provider)).toBe(false)
      expect(checkoutExpiresAt(provider)).toBeNull()
    },
  )

  it('an unknown or missing provider gets no TTL', () => {
    expect(checkoutExpiresAt(null)).toBeNull()
    expect(checkoutExpiresAt('not-a-provider')).toBeNull()
  })

  it('defaults to 24h, matching the checkout_abandoned metric definition', () => {
    delete process.env.CHECKOUT_TTL_MINUTES
    expect(checkoutTtlMinutes()).toBe(DEFAULT_CHECKOUT_TTL_MINUTES)
    const now = new Date('2026-08-29T00:00:00.000Z')
    expect(checkoutExpiresAt('paypal', now)).toBe('2026-08-30T00:00:00.000Z')
  })

  it('honours a positive CHECKOUT_TTL_MINUTES override', () => {
    process.env.CHECKOUT_TTL_MINUTES = '30'
    const now = new Date('2026-08-29T00:00:00.000Z')
    expect(checkoutExpiresAt('paypal', now)).toBe('2026-08-29T00:30:00.000Z')
  })

  // A typo'd or zeroed env var must not collapse the TTL to "already expired",
  // which would cancel every hosted checkout on the next cron tick.
  it.each(['0', '-5', 'soon', ''])('ignores the nonsense override %o', value => {
    process.env.CHECKOUT_TTL_MINUTES = value
    expect(checkoutTtlMinutes()).toBe(DEFAULT_CHECKOUT_TTL_MINUTES)
  })
})

/** Records the writes and RPCs the dispatcher makes for one transaction row. */
function makeFakeAdmin(tx: Record<string, unknown> | null, rpcOutcome: string | null = null) {
  const updates: { table: string; values: Record<string, unknown> }[] = []
  const rpc: { fn: string; args: Record<string, unknown> }[] = []

  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      update(values: Record<string, unknown>) {
        updates.push({ table, values })
        return b
      },
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: tx, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return b
  }

  const admin = {
    from: (table: string) => builder(table),
    rpc(fn: string, args: Record<string, unknown>) {
      rpc.push({ fn, args })
      if (fn === 'settle_expired_checkout') {
        return Promise.resolve({ data: rpcOutcome, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    },
  }

  return { admin: admin as unknown as SupabaseClient, updates, rpc }
}

const OWNER = { userId: 'user-1', tenantId: 'tenant-1' }

function expiredTx(over: Record<string, unknown> = {}) {
  return {
    transaction_id: 7,
    status: 'canceled',
    user_id: 'user-1',
    tenant_id: 'tenant-1',
    amount: 49,
    currency: 'usd',
    refunded_amount: 0,
    school_percentage_snapshot: 80,
    plan_id: null,
    product_id: 10,
    ...over,
  }
}

function event(extra: Partial<NormalizedBillingEvent>): NormalizedBillingEvent {
  return { type: 'payment.succeeded', providerEventId: 'evt-1', raw: {}, ...extra } as NormalizedBillingEvent
}

describe('late settlement after checkout expiry', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The core of the feature. Without this the reconciler would cancel a
  // checkout, the buyer's PayPal payment would land an hour later, and the
  // dispatcher's `status === 'pending'` guard would drop it: charged, no access.
  it('revives an expired checkout when nothing else settled', async () => {
    const { admin, rpc } = makeFakeAdmin(expiredTx(), 'revived')
    await dispatchBillingEvent(
      event({ reference: '7', metadata: OWNER }),
      { provider: 'paypal', admin },
    )
    expect(rpc).toEqual([{ fn: 'settle_expired_checkout', args: { _transaction_id: 7 } }])
  })

  // The buyer retried and that purchase settled first — so they paid twice.
  // Reviving would double-enroll and double-count revenue; the RPC refuses and
  // the dispatcher must not paper over it.
  it('does not revive when a replacement purchase already settled', async () => {
    const { admin, updates, rpc } = makeFakeAdmin(expiredTx(), 'duplicate')
    await dispatchBillingEvent(
      event({ reference: '7', metadata: OWNER }),
      { provider: 'paypal', admin },
    )
    expect(rpc).toHaveLength(1)
    // The RPC owns every write in this path; the dispatcher adds none of its own.
    expect(updates.filter(u => u.table === 'transactions')).toHaveLength(0)
    expect(console.error).toHaveBeenCalled()
  })

  // A refunded or admin-cancelled transaction has expired_at = NULL, so the RPC
  // returns 'ineligible' and a replayed webhook cannot resurrect it. Asserted
  // from the dispatcher side: it still asks, and accepts the refusal.
  it('accepts the RPC refusing a row that was never an expired checkout', async () => {
    const { admin, updates } = makeFakeAdmin(expiredTx(), 'ineligible')
    await dispatchBillingEvent(
      event({ reference: '7', metadata: OWNER }),
      { provider: 'paypal', admin },
    )
    expect(updates.filter(u => u.table === 'transactions')).toHaveLength(0)
  })

  it('leaves the normal pending flip untouched', async () => {
    const { admin, updates, rpc } = makeFakeAdmin(expiredTx({ status: 'pending' }))
    await dispatchBillingEvent(
      event({ reference: '7', metadata: OWNER }),
      { provider: 'paypal', admin },
    )
    expect(rpc.filter(r => r.fn === 'settle_expired_checkout')).toHaveLength(0)
    expect(updates[0]).toMatchObject({ table: 'transactions', values: { status: 'successful' } })
  })

  // handle_new_subscription copies provider_subscription_id and
  // payment_provider OFF the transaction when the flip fires its trigger.
  // Reviving first would build the subscription row with a null provider id,
  // leaving it unmatchable by every later renewal/cancel webhook.
  it('writes the subscription identity BEFORE reviving, not after', async () => {
    const { admin, updates, rpc } = makeFakeAdmin(expiredTx({ plan_id: 3, product_id: null }), 'revived')
    await dispatchBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: 'evt-2',
        providerSubscriptionId: 'sub_ls_1',
        reference: '7',
        metadata: OWNER,
        raw: {},
      } as NormalizedBillingEvent,
      { provider: 'lemonsqueezy', admin },
    )
    expect(updates[0]).toMatchObject({
      table: 'transactions',
      values: { provider_subscription_id: 'sub_ls_1', payment_provider: 'lemonsqueezy' },
    })
    expect(rpc.some(r => r.fn === 'settle_expired_checkout')).toBe(true)
  })

  // A 'duplicate' produced a refund liability, not a subscription. Aligning a
  // period would rewrite the REPLACEMENT subscription's window from a payment
  // that must never count.
  it('does not align a billing period for a duplicate settlement', async () => {
    const { admin, rpc } = makeFakeAdmin(expiredTx({ plan_id: 3, product_id: null }), 'duplicate')
    await dispatchBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: 'evt-3',
        providerSubscriptionId: 'sub_ls_2',
        reference: '7',
        metadata: OWNER,
        periodEnd: new Date('2026-09-29T00:00:00.000Z'),
        raw: {},
      } as NormalizedBillingEvent,
      { provider: 'lemonsqueezy', admin },
    )
    expect(rpc.some(r => r.fn === 'apply_webhook_subscription_period')).toBe(false)
  })

  it('aligns the billing period after a revival', async () => {
    const { admin, rpc } = makeFakeAdmin(expiredTx({ plan_id: 3, product_id: null }), 'revived')
    await dispatchBillingEvent(
      {
        type: 'subscription.activated',
        providerEventId: 'evt-4',
        providerSubscriptionId: 'sub_ls_3',
        reference: '7',
        metadata: OWNER,
        periodEnd: new Date('2026-09-29T00:00:00.000Z'),
        raw: {},
      } as NormalizedBillingEvent,
      { provider: 'lemonsqueezy', admin },
    )
    expect(rpc.some(r => r.fn === 'apply_webhook_subscription_period')).toBe(true)
  })

  // The owner-binding guard (M1) must run BEFORE any revival: `reference` is a
  // sequential id, so without it a signed event could revive — and enroll —
  // another tenant's expired transaction by guessing the number.
  it('refuses to revive on an owner mismatch', async () => {
    const { admin, rpc } = makeFakeAdmin(expiredTx(), 'revived')
    await expect(
      dispatchBillingEvent(
        event({ reference: '7', metadata: { userId: 'someone-else', tenantId: 'tenant-1' } }),
        { provider: 'paypal', admin },
      ),
    ).rejects.toThrow(/owner mismatch/)
    expect(rpc).toHaveLength(0)
  })
})
