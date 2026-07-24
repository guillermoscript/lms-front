import { describe, it, expect } from 'vitest'
import { computeOwedBalances } from '@/lib/payments/payouts-owed'

describe('computeOwedBalances', () => {
  it('single tenant, single provider, nothing paid yet', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [],
    )
    expect(result).toEqual([
      {
        tenantId: 't1',
        tenantName: 'School A',
        schoolPercentage: 80,
        grossCollected: 100,
        grossOwed: 80,
        alreadyPaid: 0,
        netOwed: 80,
        byProvider: { paypal: 100 },
      },
    ])
  })

  it('sums multiple transactions across multiple providers for the same tenant', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100 },
        { tenantId: 't1', paymentProvider: 'paypal', amount: 50 },
        { tenantId: 't1', paymentProvider: 'binance', amount: 25 },
      ],
      [],
    )
    expect(result[0].grossCollected).toBe(175)
    expect(result[0].grossOwed).toBeCloseTo(140) // 175 * 0.8
    expect(result[0].byProvider).toEqual({ paypal: 150, binance: 25 })
  })

  it('subtracts already-paid manual payouts from the gross owed', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [{ tenantId: 't1', amount: 30 }],
    )
    expect(result[0].grossOwed).toBe(80)
    expect(result[0].alreadyPaid).toBe(30)
    expect(result[0].netOwed).toBe(50)
  })

  it('sums multiple manual payouts already paid', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [{ tenantId: 't1', amount: 30 }, { tenantId: 't1', amount: 50 }],
    )
    expect(result[0].alreadyPaid).toBe(80)
    expect(result[0].netOwed).toBe(0)
  })

  it('floors netOwed at 0 when payouts exceed what was owed (overpay/rounding)', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [{ tenantId: 't1', amount: 500 }],
    )
    expect(result[0].netOwed).toBe(0)
  })

  it('tenant with zero platform-settled transactions owes nothing', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 }],
      [],
      [],
    )
    expect(result[0]).toMatchObject({
      grossCollected: 0,
      grossOwed: 0,
      alreadyPaid: 0,
      netOwed: 0,
      byProvider: {},
    })
  })

  it('boundary schoolPercentage=0 → platform keeps everything, nothing owed', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 0 }],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [],
    )
    expect(result[0].netOwed).toBe(0)
  })

  it('boundary schoolPercentage=100 → school is owed the full amount collected', () => {
    const result = computeOwedBalances(
      [{ tenantId: 't1', tenantName: 'School A', schoolPercentage: 100 }],
      [{ tenantId: 't1', paymentProvider: 'lemonsqueezy', amount: 100 }],
      [],
    )
    expect(result[0].netOwed).toBe(100)
  })

  it('keeps tenants isolated from each other', () => {
    const result = computeOwedBalances(
      [
        { tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 },
        { tenantId: 't2', tenantName: 'School B', schoolPercentage: 90 },
      ],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 100 },
        { tenantId: 't2', paymentProvider: 'paypal', amount: 200 },
      ],
      [{ tenantId: 't1', amount: 10 }],
    )
    const a = result.find((r) => r.tenantId === 't1')!
    const b = result.find((r) => r.tenantId === 't2')!
    expect(a.netOwed).toBe(70) // 100*0.8 - 10
    expect(b.netOwed).toBe(180) // 200*0.9, unaffected by t1's payout
  })

  it('returns one row per tenant, even with no matching transactions/payouts', () => {
    const result = computeOwedBalances(
      [
        { tenantId: 't1', tenantName: 'School A', schoolPercentage: 80 },
        { tenantId: 't2', tenantName: 'School B', schoolPercentage: 80 },
      ],
      [{ tenantId: 't1', paymentProvider: 'paypal', amount: 100 }],
      [],
    )
    expect(result).toHaveLength(2)
  })
})
