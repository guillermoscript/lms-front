import { describe, it, expect } from 'vitest'
import { computeOwedBalances } from '@/lib/payments/payouts-owed'

function balanceFor(result: ReturnType<typeof computeOwedBalances>, tenantId: string, currency: string) {
  return result.find((r) => r.tenantId === tenantId)?.balances.find((b) => b.currency === currency)
}

describe('computeOwedBalances', () => {
  it('single tenant, single provider, single currency, nothing paid yet', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [],
    )
    expect(result).toHaveLength(1)
    expect(result[0].balances).toEqual([
      {
        currency: 'usd',
        grossCollected: 100,
        grossOwed: 80,
        alreadyPaid: 0,
        netOwed: 80,
        byProvider: { paypal: 100 },
      },
    ])
  })

  it('sums multiple transactions across multiple providers in the same currency', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 50, currency: 'usd', schoolPercentageSnapshot: null },
        { tenantId: 't1', paymentProvider: 'binance', amount: 25, currency: 'usd', schoolPercentageSnapshot: null },
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
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 80, currency: 'eur', schoolPercentageSnapshot: null },
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
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [{ tenantId: 't1', amount: 30, currency: 'usd' }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossOwed).toBe(80)
    expect(usd.alreadyPaid).toBe(30)
    expect(usd.netOwed).toBe(50)
  })

  it('#497: a EUR payout does not reduce what is owed in USD', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [{ tenantId: 't1', amount: 30, currency: 'eur' }],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.netOwed).toBe(80) // unaffected by the EUR payout
    const eur = balanceFor(result, 't1', 'eur')!
    expect(eur).toMatchObject({ grossCollected: 0, grossOwed: 0, alreadyPaid: 30, netOwed: 0 })
  })

  it('floors netOwed at 0 when payouts exceed what was owed (overpay/rounding)', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [{ tenantId: 't1', amount: 500, currency: 'usd' }],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(0)
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
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.netOwed).toBe(0)
  })

  it('boundary schoolPercentage=100 → school is owed the full amount collected', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 100 }],
      [{ tenantId: 't1', paymentProvider: 'lemonsqueezy', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
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
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null },
        { tenantId: 't2', paymentProvider: 'paypal', amount: 200, currency: 'usd', schoolPercentageSnapshot: null },
      ],
      [{ tenantId: 't1', amount: 10, currency: 'usd' }],
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
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [],
    )
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.tenantId === 't2')!.balances).toEqual([])
  })

  it('#496: a plan change after a sale does not retroactively reprice it — uses the snapshotted split, not the current one', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 90 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 10000, currency: 'usd', schoolPercentageSnapshot: 100 }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.grossOwed).toBe(10000)
  })

  it('#496: transactions predating the snapshot column fall back to the tenant\'s current split', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null }],
      [],
    )
    expect(balanceFor(result, 't1', 'usd')!.grossOwed).toBe(80)
  })

  it('#496: mixes snapshotted and legacy (null-snapshot) transactions correctly in the same tenant', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 90 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: 80 },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100, currency: 'usd', schoolPercentageSnapshot: null },
      ],
      [],
    )
    const usd = balanceFor(result, 't1', 'usd')!
    expect(usd.grossCollected).toBe(200)
    expect(usd.grossOwed).toBe(80 + 90) // 100*0.8 + 100*0.9
  })
})
