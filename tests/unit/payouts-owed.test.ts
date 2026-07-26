import { describe, it, expect } from 'vitest'
import { computeOwedBalances, isPayoutMismatch, roundMoney } from '@/lib/payments/payouts-owed'

function balanceFor(result: ReturnType<typeof computeOwedBalances>, tenantId: string, currency: string) {
  return result.find((r) => r.tenantId === tenantId)?.balances.find((b) => b.currency === currency)
}

describe('computeOwedBalances', () => {
  it('single tenant, single provider, single currency, nothing paid yet', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0].balances).toEqual([
      {
        currency: 'usd',
        grossCollected: 100,
        grossOwed: 80,
        alreadyPaid: 0,
        clawback: 0,
        netOwed: 80,
        overpaid: 0,
        byProvider: { paypal: 100 },
      },
    ])
  })

  it('sums multiple transactions across multiple providers in the same currency', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 50, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
        { tenantId: 't1', paymentProvider: 'binance', amount: 25, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
      ],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossCollected).toBe(175)
    expect(usd.grossOwed).toBeCloseTo(140) // 175 * 0.8
    expect(usd.byProvider).toEqual({ paypal: 150, binance: 25 })
  })

  it('#497: keeps USD and EUR sales as two separate balances, never summed together', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 80, currency: 'eur', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
      ],
      [],
    )
    const tenant = result.find((r) => r.tenantId === 't1')!
    expect(tenant.balances).toHaveLength(2)
    const usd = balanceFor(result, 't1', 'usd')!
    const eur = balanceFor(result, 't1', 'eur')!
    expect(usd.grossCollected).toBe(100)
    expect(usd.netOwed).toBe(80)
    expect(eur.grossCollected).toBe(80)
    expect(eur.netOwed).toBe(64) // 80 * 0.8
  })

  it('subtracts already-paid manual payouts from the gross owed, in the matching currency only', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 30, currency: 'usd', coveredThrough: null }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossOwed).toBe(80)
    expect(usd.alreadyPaid).toBe(30)
    expect(usd.netOwed).toBe(50)
  })

  it('#497: a EUR payout does not reduce what is owed in USD', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 30, currency: 'eur', coveredThrough: null }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.netOwed).toBe(80) // unaffected by the EUR payout
    const eur = balanceFor(result, 't1', 'eur')!
    expect(eur).toMatchObject({ grossCollected: 0, grossOwed: 0, alreadyPaid: 30, netOwed: 0 })
  })

  it('floors netOwed at 0 when payouts exceed what was owed (overpay/rounding)', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 500, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(0)
  })

  // #516: the floor above is correct, but it used to be the whole story — the
  // size of the overpayment was nowhere on screen.
  it('reports the overpayment while netOwed stays floored at 0', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 500, currency: 'usd', coveredThrough: null }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.netOwed).toBe(0)
    expect(usd.overpaid).toBe(420) // 500 paid against 80 owed
  })

  it('reports no overpayment when the balance is exactly settled or still owed', () => {
    const settled = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(settled, 't1', 'usd')).toMatchObject({ netOwed: 0, overpaid: 0 })

    const underpaid = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 30, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(underpaid, 't1', 'usd')).toMatchObject({ netOwed: 50, overpaid: 0 })
  })

  it('keeps an overpayment inside its own currency', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'eur', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null },
      ],
      [{ tenantId: 't1', amount: 300, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(result, 't1', 'usd')).toMatchObject({ netOwed: 0, overpaid: 220 })
    // The EUR side is untouched by the USD overpayment — never cross-subsidised.
    expect(balanceFor(result, 't1', 'eur')).toMatchObject({ netOwed: 80, overpaid: 0 })
  })

  // The recovery mechanism the issue asked for: no reverse payout row exists
  // (`payouts.amount` is CHECK (amount > 0)), so the excess is absorbed by the
  // next cycle's arithmetic on its own.
  it('carries an overpayment forward against later sales instead of clawing it back', () => {
    const txns = [
      { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful' as const, transactionDate: null },
    ]
    const payouts = [{ tenantId: 't1', amount: 200, currency: 'usd', coveredThrough: null }]
    const tenants = [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }]

    expect(balanceFor(computeOwedBalances(tenants, txns, payouts), 't1', 'usd'))
      .toMatchObject({ netOwed: 0, overpaid: 120 })

    // A later 100 sale earns another 80 — the overpayment shrinks by exactly that
    // much and nothing is owed yet.
    const withLaterSale = [...txns, { ...txns[0] }]
    expect(balanceFor(computeOwedBalances(tenants, withLaterSale, payouts), 't1', 'usd'))
      .toMatchObject({ netOwed: 0, overpaid: 40 })

    // Once enough sales land, the balance crosses back into owed territory.
    const withThreeSales = [...withLaterSale, { ...txns[0] }]
    expect(balanceFor(computeOwedBalances(tenants, withThreeSales, payouts), 't1', 'usd'))
      .toMatchObject({ netOwed: 40, overpaid: 0 })
  })

  it('tenant with zero platform-settled transactions has no balances', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [],
      [],
    )
    expect(result[0].balances).toEqual([])
  })

  it('boundary schoolPercentage=0 → platform keeps everything, nothing owed', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 0 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(0)
  })

  it('boundary schoolPercentage=100 → school is owed the full amount collected', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 100 }],
      [{ tenantId: 't1', paymentProvider: 'lemonsqueezy', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(100)
  })

  it('keeps tenants isolated from each other', () => {
    const result = computeOwedBalances(
      [
        { tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 },
        { tenantId: 't2', tenantName: 'School B', schoolPercentage: 90 },
      ],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
        { tenantId: 't2', paymentProvider: 'paypal', amount: 200, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
      ],
      [{ tenantId: 't1', amount: 10, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(70) // 100*0.8 - 10
    expect(balanceFor(result, 't2', 'usd')!.netOwed).toBe(180) // 200*0.9, unaffected by t1's payout
  })

  it('returns one row per tenant, even with no matching transactions/payouts', () => {
    const result = computeOwedBalances(
      [
        { tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 },
        { tenantId: 't2', tenantName: 'School B', schoolPercentage: 80 },
      ],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [],
    )
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.tenantId === 't2')!.balances).toEqual([])
  })

  it('#496: a plan change after a sale does not retroactively reprice it — uses the snapshotted split, not the current one', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 90 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 10000, currency: 'usd', schoolPercentageSnapshot: 100 , status: 'successful', transactionDate: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.grossOwed).toBe(10000)
  })

  it('#496: transactions predating the snapshot column fall back to the tenant\'s current split', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.grossOwed).toBe(80)
  })

  it('#496: mixes snapshotted and legacy (null-snapshot) transactions correctly in the same tenant', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 90 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: 80 , status: 'successful', transactionDate: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null , status: 'successful', transactionDate: null },
      ],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossCollected).toBe(200)
    expect(usd.grossOwed).toBe(80 + 90) // 100*0.8 + 100*0.9
  })

  // #511: the four #498 cases below used to assert the double-subtraction as
  // intended behavior. Refunded sales now leave `grossOwed` and nothing else —
  // `clawback` is reporting-only and never a term in `netOwed`.
  //
  // Fixed dates so the "was this refund plausibly paid out?" comparison is
  // deterministic. A refund counts toward `clawback` only when a payout in the
  // same currency settled up to a point at or after the sale.
  const SOLD_AT = '2026-01-10T00:00:00.000Z'
  const PAID_AFTER_SALE = '2026-02-01T00:00:00.000Z'
  const PAID_BEFORE_SALE = '2026-01-01T00:00:00.000Z'

  it('#511: a refund already paid out is netted via alreadyPaid, not subtracted a second time as clawback', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        // Asymmetric on purpose: the answer sits far from 0, so the Math.max floor
        // cannot mask a sign error the way it did in the old 100/100/80 fixture.
        { tenantId: 't1', paymentProvider: 'paypal', amount: 1000, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: SOLD_AT },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT },
      ],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: PAID_AFTER_SALE }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    // Only the still-successful sale counts toward gross collected/owed.
    expect(usd.grossCollected).toBe(1000)
    expect(usd.grossOwed).toBe(800)
    expect(usd.alreadyPaid).toBe(80)
    // Visible, because a payout plausibly covered the refunded sale...
    expect(usd.clawback).toBe(80) // 100 * 0.8
    // ...but reporting only: 80% of net sales, minus what was already paid.
    expect(usd.netOwed).toBe(720) // was 640 before #511
  })

  it('#511: a refund that was never paid out does not reduce the balance at all', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 1000, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: SOLD_AT },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT },
      ],
      [], // nothing was ever paid out, so there is nothing to claw back
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.clawback).toBe(0)
    expect(usd.netOwed).toBe(800) // was 720 before #511
  })

  it('#511: a refunded sale made after the last payout is not clawed back', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 500, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: SOLD_AT },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT },
      ],
      // Settled up to BEFORE the refunded sale even happened — it cannot have paid for it.
      [{ tenantId: 't1', amount: 120, currency: 'usd', coveredThrough: PAID_BEFORE_SALE }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.clawback).toBe(0)
    expect(usd.netOwed).toBe(280) // 500*0.8 - 120
  })

  it('#511: a payout in another currency cannot make a refund count as clawed back', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT }],
      [{ tenantId: 't1', amount: 80, currency: 'eur', coveredThrough: PAID_AFTER_SALE }],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(0)
  })

  it('#511: an undated refund is not clawed back — an unjustifiable clawback is worse than a missing one', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: null }],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: PAID_AFTER_SALE }],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(0)
  })

  it('#511: a payout with no recorded date covers nothing', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT }],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(0)
  })

  it('#511: the LATEST payout date bounds the clawback window, not the first one', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT }],
      [
        { tenantId: 't1', amount: 40, currency: 'usd', coveredThrough: PAID_BEFORE_SALE },
        { tenantId: 't1', amount: 40, currency: 'usd', coveredThrough: PAID_AFTER_SALE },
      ],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(80)
  })

  it('#511: mixed offset formats compare by instant, not lexicographically', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      // '+00:00' sorts before 'Z' as a string but is the LATER instant here.
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: '2026-01-10T00:00:00+00:00' }],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: '2026-01-09T00:00:00.000Z' }],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(0)
  })

  it('#498/#511: a refunded sale is excluded from grossCollected/grossOwed but still yields a balance row', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT }],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossCollected).toBe(0) // refunded sale never counted as collected
    expect(usd.grossOwed).toBe(0)
    expect(usd.netOwed).toBe(0)
    expect(usd.byProvider).toEqual({}) // byProvider mirrors grossCollected
  })

  it('#498: a refund in one currency does not affect a balance owed in another currency', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: SOLD_AT },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 50, currency: 'eur', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT },
      ],
      [{ tenantId: 't1', amount: 40, currency: 'eur', coveredThrough: PAID_AFTER_SALE }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    const eur = balanceFor(result, 't1', 'eur')!
    expect(usd.clawback).toBe(0)
    expect(usd.netOwed).toBe(80) // unaffected by the EUR refund
    expect(eur.clawback).toBe(40) // 50 * 0.8
    expect(eur.netOwed).toBe(0) // nothing successful in EUR; the 40 paid is not re-owed
  })

  it('#498: refund uses the transaction\'s own snapshotted split, same as a normal sale would', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 50 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: 90, status: 'refunded', transactionDate: SOLD_AT }],
      [{ tenantId: 't1', amount: 90, currency: 'usd', coveredThrough: PAID_AFTER_SALE }],
    )
    // Uses the 90% split in effect when the original sale happened, not the tenant's current 50%.
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(90)
  })

  it('#511: a fully refunded, fully paid-out school reads 0 owed, with the unrecovered share visible as clawback', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 250, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: SOLD_AT }],
      [{ tenantId: 't1', amount: 200, currency: 'usd', coveredThrough: PAID_AFTER_SALE }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    // The floor holds: this view never invents a negative balance...
    expect(usd.netOwed).toBe(0)
    // ...so clawback is the only place the 200 still to recover shows up.
    expect(usd.clawback).toBe(200) // 250 * 0.8
  })

  // ---------------------------------------------------------------------------
  // #547 §4 — rounding residue.
  //
  // All 31 cases above use round amounts at round percentages, which is exactly
  // why the residue was invisible: every product of the two lands on a whole
  // cent. Real catalogues are full of `.99` prices.
  // ---------------------------------------------------------------------------

  it('#547: a $49.99 sale at 80%, paid in full, settles at EXACTLY 0', () => {
    // Unrounded this is 39.992. The dialog pre-fills `netOwed.toFixed(2)` and
    // `payouts.amount` is NUMERIC(10,2), so 39.99 is the most an operator can
    // ever pay — leaving 0.002 owed forever, rendered as "$0.00" on a row whose
    // Mark-as-paid button stayed enabled.
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 49.99, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [{ tenantId: 't1', amount: 39.99, currency: 'usd', coveredThrough: null }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossOwed).toBe(39.99)
    expect(usd.netOwed).toBe(0)
    expect(usd.overpaid).toBe(0)
  })

  it('#547: 33.33 at 70% rounds to whole cents per transaction', () => {
    // 23.331 → 23.33, and three of them sum to 69.99 rather than 69.993.
    const txn = { tenantId: 't1', paymentProvider: 'binance', amount: 33.33, currency: 'usd', schoolPercentageSnapshot: 70, status: 'successful' as const, transactionDate: null }
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [txn, txn, txn],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossOwed).toBe(69.99)
    expect(usd.grossCollected).toBe(99.99)
  })

  it('#547: residue accumulated across many fractional sales never reappears', () => {
    const txns = Array.from({ length: 25 }, () => ({
      tenantId: 't1', paymentProvider: 'paypal', amount: 19.99, currency: 'usd',
      schoolPercentageSnapshot: 80, status: 'successful' as const, transactionDate: null,
    }))
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      txns,
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossOwed).toBe(399.75) // 25 × 15.99, not 25 × 15.992
    // Paying exactly what the operator is shown clears the balance completely.
    const settled = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      txns,
      [{ tenantId: 't1', amount: 399.75, currency: 'usd', coveredThrough: null }],
    )
    expect(balanceFor(settled, 't1', 'usd')!.netOwed).toBe(0)
  })

  it('#547: roundMoney is half-UP, so a tie favours the school, not the platform', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(39.992)).toBe(39.99)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
  })

  // ---------------------------------------------------------------------------
  // #547 §1 — partial refunds, from the payout side.
  // ---------------------------------------------------------------------------

  it('#547: a partial refund reduces grossOwed by the refunded SLICE, not by the whole sale', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, refundedAmount: 10, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    // The platform kept 90 and owes 80% of it. Before #547 the row flipped to
    // 'refunded' wholesale and the school was owed 0 — a $72 under-payment.
    expect(usd.grossCollected).toBe(90)
    expect(usd.grossOwed).toBe(72)
    expect(usd.netOwed).toBe(72)
    expect(usd.byProvider).toEqual({ paypal: 90 })
  })

  it('#547: a FULL refund still leaves grossOwed entirely (unchanged from #511)', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, refundedAmount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: null }],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossCollected).toBe(0)
    expect(usd.grossOwed).toBe(0)
  })

  it('#547: clawback on a fully refunded sale reports the FULL share, not the zero remainder', () => {
    // A row that reached 'refunded' has refunded_amount == amount, so scaling
    // the net would tell the operator a payout for a refunded sale was worth
    // nothing. Clawback answers "how much of what we already paid was for this".
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 250, refundedAmount: 250, currency: 'usd', schoolPercentageSnapshot: null, status: 'refunded', transactionDate: '2026-01-01T00:00:00Z' }],
      [{ tenantId: 't1', amount: 200, currency: 'usd', coveredThrough: '2026-02-01T00:00:00Z' }],
    )
    expect(balanceFor(result, 't1', 'usd')!.clawback).toBe(200)
  })

  it('#547: a partially refunded sale is NOT clawed back — it is still a live sale', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, refundedAmount: 10, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: '2026-01-01T00:00:00Z' }],
      [{ tenantId: 't1', amount: 80, currency: 'usd', coveredThrough: '2026-02-01T00:00:00Z' }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.clawback).toBe(0)
    // 72 owed, 80 already paid → 8 overpaid, recovered by carry-forward (#516).
    expect(usd.netOwed).toBe(0)
    expect(usd.overpaid).toBe(8)
  })

  it('#547: a missing refundedAmount behaves exactly as 0 (every pre-migration row)', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null, status: 'successful', transactionDate: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.grossOwed).toBe(80)
  })
})

describe('isPayoutMismatch (#547 — the boundary markPayoutPaid had no coverage for)', () => {
  it('challenges ANY positive payout when nothing is owed', () => {
    // netOwed === 0 makes the tolerance 0, so every amount is a mismatch. That
    // is deliberate: a school owed nothing must not be paid without an explicit
    // confirmation. The residue fix makes this state reachable at all — before
    // it, a settled balance sat at 0.002 rather than 0.
    expect(isPayoutMismatch(0.01, 0)).toBe(true)
    expect(isPayoutMismatch(1000, 0)).toBe(true)
  })

  it('accepts an exact payout, and one inside the 10% tolerance', () => {
    expect(isPayoutMismatch(39.99, 39.99)).toBe(false)
    expect(isPayoutMismatch(40, 39.99)).toBe(false)
    expect(isPayoutMismatch(36, 39.99)).toBe(false) // ~10% low
  })

  it('challenges a mistyped extra zero', () => {
    expect(isPayoutMismatch(399.9, 39.99)).toBe(true)
  })
})
