import { describe, it, expect, vi } from 'vitest'
import type Stripe from 'stripe'
import {
  inspectStripeCheckout,
  stripeCheckoutMatches,
  releaseStripeCheckout,
  abandonStripeCheckout,
  OBJECTLESS_GRACE_MS,
  type StripeCheckoutRow,
  type StripeCheckoutState,
} from '@/lib/payments/stripe-reconcile'

/**
 * Reconciling a Stripe Elements checkout nobody came back to (#754). Mirrors
 * the PayPal/Lemon Squeezy reconciler tests in expire-stale-checkouts.test.ts:
 * a fake Stripe (plain object, no SDK) drives `inspectStripeCheckout` /
 * `releaseStripeCheckout` / `abandonStripeCheckout` through every outcome, and
 * `stripeCheckoutMatches` is pinned on every field that would otherwise let a
 * reused checkout bill stale terms.
 */

function makeStripe(over: {
  piRetrieve?: (id: string) => unknown
  piCancel?: (id: string) => unknown
  subRetrieve?: (id: string, opts?: unknown) => unknown
  subCancel?: (id: string) => unknown
} = {}) {
  return {
    paymentIntents: {
      retrieve: vi.fn(over.piRetrieve ?? (() => Promise.reject(new Error('not stubbed')))),
      cancel: vi.fn(over.piCancel ?? (() => Promise.resolve({}))),
    },
    subscriptions: {
      retrieve: vi.fn(over.subRetrieve ?? (() => Promise.reject(new Error('not stubbed')))),
      cancel: vi.fn(over.subCancel ?? (() => Promise.resolve({}))),
    },
  } as unknown as Stripe
}

function piRow(over: Partial<StripeCheckoutRow> = {}): StripeCheckoutRow {
  return {
    transaction_id: 1,
    stripe_payment_intent_id: 'pi_1',
    provider_subscription_id: null,
    transaction_date: new Date().toISOString(),
    ...over,
  }
}

function subRow(over: Partial<StripeCheckoutRow> = {}): StripeCheckoutRow {
  return {
    transaction_id: 2,
    stripe_payment_intent_id: null,
    provider_subscription_id: 'sub_1',
    transaction_date: new Date().toISOString(),
    ...over,
  }
}

function objectlessRow(over: Partial<StripeCheckoutRow> = {}): StripeCheckoutRow {
  return {
    transaction_id: 3,
    stripe_payment_intent_id: null,
    provider_subscription_id: null,
    transaction_date: new Date().toISOString(),
    ...over,
  }
}

describe('inspectStripeCheckout — PaymentIntent rows', () => {
  it('requires_payment_method → payable, with a string transfer_data.destination', async () => {
    const stripe = makeStripe({
      piRetrieve: () =>
        Promise.resolve({
          status: 'requires_payment_method',
          client_secret: 'cs_1',
          amount: 5000,
          currency: 'usd',
          transfer_data: { destination: 'acct_1' },
          application_fee_amount: 500,
        }),
    })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({
      outcome: 'payable',
      clientSecret: 'cs_1',
      amount: 5000,
      currency: 'usd',
      priceId: null,
      destination: 'acct_1',
      applicationFee: 500,
    })
  })

  it('requires_confirmation / requires_action are payable too', async () => {
    for (const status of ['requires_confirmation', 'requires_action']) {
      const stripe = makeStripe({
        piRetrieve: () =>
          Promise.resolve({
            status,
            client_secret: 'cs_x',
            amount: 100,
            currency: 'usd',
            transfer_data: null,
            application_fee_amount: null,
          }),
      })
      const state = await inspectStripeCheckout(stripe, piRow())
      expect(state.outcome).toBe('payable')
    }
  })

  it('resolves an object-form transfer_data.destination ({ id })', async () => {
    const stripe = makeStripe({
      piRetrieve: () =>
        Promise.resolve({
          status: 'requires_payment_method',
          client_secret: 'cs_2',
          amount: 5000,
          currency: 'usd',
          transfer_data: { destination: { id: 'acct_2' } },
          application_fee_amount: 0,
        }),
    })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toMatchObject({ outcome: 'payable', destination: 'acct_2' })
  })

  it('a payable status with no client_secret is unknown, never a false payable', async () => {
    const stripe = makeStripe({
      piRetrieve: () => Promise.resolve({ status: 'requires_payment_method', client_secret: null }),
    })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'unknown' })
  })

  it.each(['succeeded', 'processing', 'requires_capture'])('%s → in_flight', async status => {
    const stripe = makeStripe({ piRetrieve: () => Promise.resolve({ status }) })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'in_flight' })
  })

  it('canceled → dead', async () => {
    const stripe = makeStripe({ piRetrieve: () => Promise.resolve({ status: 'canceled' }) })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'dead' })
  })

  it('a 404 (statusCode) from Stripe → dead, the PI is gone', async () => {
    const stripe = makeStripe({
      piRetrieve: () => Promise.reject(Object.assign(new Error('no such payment_intent'), { statusCode: 404 })),
    })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'dead' })
  })

  it('a resource_missing code from Stripe → dead', async () => {
    const stripe = makeStripe({
      piRetrieve: () => Promise.reject(Object.assign(new Error('gone'), { code: 'resource_missing' })),
    })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'dead' })
  })

  it('a generic Stripe error → unknown, never read as abandoned', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stripe = makeStripe({ piRetrieve: () => Promise.reject(new Error('Stripe API is down')) })
    const state = await inspectStripeCheckout(stripe, piRow())
    expect(state).toEqual({ outcome: 'unknown' })
    spy.mockRestore()
  })
})

describe('inspectStripeCheckout — subscription rows', () => {
  it('incomplete + open invoice with a confirmation_secret → payable, carries priceId', async () => {
    const stripe = makeStripe({
      subRetrieve: () =>
        Promise.resolve({
          status: 'incomplete',
          latest_invoice: {
            status: 'open',
            amount_due: 2000,
            currency: 'usd',
            confirmation_secret: { client_secret: 'cs_sub_1' },
          },
          items: { data: [{ price: { id: 'price_123' } }] },
          transfer_data: { destination: 'acct_9' },
          application_fee_percent: 15,
        }),
    })
    const state = await inspectStripeCheckout(stripe, subRow())
    expect(state).toEqual({
      outcome: 'payable',
      clientSecret: 'cs_sub_1',
      amount: 2000,
      currency: 'usd',
      priceId: 'price_123',
      destination: 'acct_9',
      applicationFee: 15,
    })
  })

  it('incomplete + invoice already paid → in_flight, not payable', async () => {
    const stripe = makeStripe({
      subRetrieve: () =>
        Promise.resolve({
          status: 'incomplete',
          latest_invoice: { status: 'paid' },
        }),
    })
    const state = await inspectStripeCheckout(stripe, subRow())
    expect(state).toEqual({ outcome: 'in_flight' })
  })

  it('active → in_flight', async () => {
    const stripe = makeStripe({ subRetrieve: () => Promise.resolve({ status: 'active' }) })
    const state = await inspectStripeCheckout(stripe, subRow())
    expect(state).toEqual({ outcome: 'in_flight' })
  })

  it.each(['incomplete_expired', 'canceled'])('%s → dead', async status => {
    const stripe = makeStripe({ subRetrieve: () => Promise.resolve({ status }) })
    const state = await inspectStripeCheckout(stripe, subRow())
    expect(state).toEqual({ outcome: 'dead' })
  })

  it('incomplete with no confirmation_secret client_secret → unknown', async () => {
    const stripe = makeStripe({
      subRetrieve: () =>
        Promise.resolve({
          status: 'incomplete',
          latest_invoice: { status: 'open', confirmation_secret: null },
        }),
    })
    const state = await inspectStripeCheckout(stripe, subRow())
    expect(state).toEqual({ outcome: 'unknown' })
  })
})

describe('inspectStripeCheckout — objectless rows (crash between insert and the Stripe call)', () => {
  it('younger than OBJECTLESS_GRACE_MS → in_flight (maybe a concurrent double-click still creating one)', async () => {
    const stripe = makeStripe()
    const now = new Date('2026-09-15T12:00:00.000Z')
    const row = objectlessRow({ transaction_date: new Date(now.getTime() - (OBJECTLESS_GRACE_MS - 1000)).toISOString() })
    const state = await inspectStripeCheckout(stripe, row, now)
    expect(state).toEqual({ outcome: 'in_flight' })
  })

  it('older than OBJECTLESS_GRACE_MS → dead', async () => {
    const stripe = makeStripe()
    const now = new Date('2026-09-15T12:00:00.000Z')
    const row = objectlessRow({ transaction_date: new Date(now.getTime() - (OBJECTLESS_GRACE_MS + 1000)).toISOString() })
    const state = await inspectStripeCheckout(stripe, row, now)
    expect(state).toEqual({ outcome: 'dead' })
  })
})

describe('stripeCheckoutMatches', () => {
  const payablePI = (over: Partial<Extract<StripeCheckoutState, { outcome: 'payable' }>> = {}): Extract<
    StripeCheckoutState,
    { outcome: 'payable' }
  > => ({
    outcome: 'payable',
    clientSecret: 'cs',
    amount: 5000,
    currency: 'usd',
    priceId: null,
    destination: 'acct_1',
    applicationFee: 500,
    ...over,
  })

  const expectedPI = {
    kind: 'payment_intent' as const,
    amount: 5000,
    currency: 'usd',
    destination: 'acct_1',
    applicationFeeAmount: 500,
  }

  it('matches on every field, currency compared case-insensitively', () => {
    expect(stripeCheckoutMatches(payablePI({ currency: 'USD' }), expectedPI)).toBe(true)
  })

  it('mismatches on amount', () => {
    expect(stripeCheckoutMatches(payablePI({ amount: 4000 }), expectedPI)).toBe(false)
  })

  it('mismatches on currency', () => {
    expect(stripeCheckoutMatches(payablePI({ currency: 'eur' }), expectedPI)).toBe(false)
  })

  it('mismatches on destination (the school reconnected a new account)', () => {
    expect(stripeCheckoutMatches(payablePI({ destination: 'acct_2' }), expectedPI)).toBe(false)
  })

  it('mismatches on application fee (the plan/fee % changed)', () => {
    expect(stripeCheckoutMatches(payablePI({ applicationFee: 0 }), expectedPI)).toBe(false)
  })

  it('subscription: matches on priceId + destination + fee percent', () => {
    const state = payablePI({ priceId: 'price_new', applicationFee: 15 })
    expect(
      stripeCheckoutMatches(state, {
        kind: 'subscription',
        priceId: 'price_new',
        destination: 'acct_1',
        applicationFeePercent: 15,
      }),
    ).toBe(true)
  })

  it('subscription: mismatches on priceId (the plan price changed)', () => {
    const state = payablePI({ priceId: 'price_old', applicationFee: 15 })
    expect(
      stripeCheckoutMatches(state, {
        kind: 'subscription',
        priceId: 'price_new',
        destination: 'acct_1',
        applicationFeePercent: 15,
      }),
    ).toBe(false)
  })

  it('a payment_intent-shaped leftover never matches a subscription expectation (priceId set)', () => {
    // A leftover PaymentIntent's state always has priceId === null; if the
    // caller expects a subscription (a priceId), the PI path fails via the
    // `state.priceId === expected.priceId` check on the subscription branch —
    // and the inverse, checking a subscription-shaped state (priceId set)
    // against a payment_intent expectation, must also fail.
    const subscriptionShaped = payablePI({ priceId: 'price_123' })
    expect(stripeCheckoutMatches(subscriptionShaped, expectedPI)).toBe(false)
  })
})

describe('releaseStripeCheckout', () => {
  it('cancel succeeds → true', async () => {
    const stripe = makeStripe({ piCancel: () => Promise.resolve({}) })
    await expect(releaseStripeCheckout(stripe, piRow())).resolves.toBe(true)
  })

  it('cancel throws 404/resource_missing (already gone) → true', async () => {
    const stripe = makeStripe({
      piCancel: () => Promise.reject(Object.assign(new Error('gone'), { statusCode: 404 })),
    })
    await expect(releaseStripeCheckout(stripe, piRow())).resolves.toBe(true)
  })

  it('cancel throws for another reason, and a re-read shows it succeeded → false (cannot release money already taken)', async () => {
    const stripe = makeStripe({
      piCancel: () => Promise.reject(new Error('You cannot cancel a PaymentIntent with status succeeded')),
      piRetrieve: () => Promise.resolve({ status: 'succeeded' }),
    })
    await expect(releaseStripeCheckout(stripe, piRow())).resolves.toBe(false)
  })

  it('cancel throws, and a re-read shows canceled → true', async () => {
    const stripe = makeStripe({
      piCancel: () => Promise.reject(new Error('already canceled')),
      piRetrieve: () => Promise.resolve({ status: 'canceled' }),
    })
    await expect(releaseStripeCheckout(stripe, piRow())).resolves.toBe(true)
  })

  it('subscription rows cancel via stripe.subscriptions.cancel, not paymentIntents', async () => {
    const stripe = makeStripe({ subCancel: () => Promise.resolve({}) })
    await expect(releaseStripeCheckout(stripe, subRow())).resolves.toBe(true)
    expect((stripe as unknown as { subscriptions: { cancel: ReturnType<typeof vi.fn> } }).subscriptions.cancel).toHaveBeenCalledWith('sub_1')
    expect((stripe as unknown as { paymentIntents: { cancel: ReturnType<typeof vi.fn> } }).paymentIntents.cancel).not.toHaveBeenCalled()
  })
})

describe('abandonStripeCheckout', () => {
  it('payable + release ok → dead', async () => {
    const stripe = makeStripe({
      piRetrieve: () =>
        Promise.resolve({
          status: 'requires_payment_method',
          client_secret: 'cs',
          amount: 100,
          currency: 'usd',
          transfer_data: null,
          application_fee_amount: 0,
        }),
      piCancel: () => Promise.resolve({}),
    })
    await expect(abandonStripeCheckout(stripe, piRow())).resolves.toBe('dead')
  })

  it('payable + release fails → unknown (never silently drop it)', async () => {
    const stripe = makeStripe({
      piRetrieve: () =>
        Promise.resolve({
          status: 'requires_payment_method',
          client_secret: 'cs',
          amount: 100,
          currency: 'usd',
          transfer_data: null,
          application_fee_amount: 0,
        }),
      piCancel: () => Promise.reject(new Error('cannot cancel — already confirmed')),
    })
    // The re-read inside releaseStripeCheckout uses the same stubbed
    // piRetrieve, which still reports requires_payment_method (not dead), so
    // release resolves false and abandonStripeCheckout must report 'unknown'.
    await expect(abandonStripeCheckout(stripe, piRow())).resolves.toBe('unknown')
  })

  it('in_flight passes through untouched, without attempting a release', async () => {
    const stripe = makeStripe({ piRetrieve: () => Promise.resolve({ status: 'processing' }) })
    await expect(abandonStripeCheckout(stripe, piRow())).resolves.toBe('in_flight')
    expect((stripe as unknown as { paymentIntents: { cancel: ReturnType<typeof vi.fn> } }).paymentIntents.cancel).not.toHaveBeenCalled()
  })

  it('dead passes through untouched', async () => {
    const stripe = makeStripe({ piRetrieve: () => Promise.resolve({ status: 'canceled' }) })
    await expect(abandonStripeCheckout(stripe, piRow())).resolves.toBe('dead')
  })

  it('unknown passes through untouched', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const stripe = makeStripe({ piRetrieve: () => Promise.reject(new Error('down')) })
    await expect(abandonStripeCheckout(stripe, piRow())).resolves.toBe('unknown')
    spy.mockRestore()
  })
})
