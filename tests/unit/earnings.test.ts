import { describe, it, expect } from 'vitest'
import { computeOwedBalances } from '@/lib/payments/payouts-owed'
import { filterEarnings, monthTotals, paginate, toEarningsRow, type EarningsTxn } from '@/lib/payments/earnings'

const base: EarningsTxn = {
  transactionId: 1, paymentProvider: 'paypal', amount: 100, refundedAmount: 0, currency: 'usd',
  schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-10-05T12:00:00Z',
}

describe('earnings', () => {
  it('splits commission and net using the snapshot, net of partial refunds', () => {
    const r = toEarningsRow({ ...base, refundedAmount: 20 })
    expect(r.kept).toBe(80)
    expect(r.net).toBe(64)
    expect(r.commission).toBe(16)
  })

  it('falls back to default split without a snapshot', () => {
    expect(toEarningsRow({ ...base, schoolPercentageSnapshot: null }).net).toBe(80)
  })

  it('sum of row nets reconciles with computeOwedBalances grossOwed', () => {
    const txns: EarningsTxn[] = [
      { ...base, transactionId: 1, amount: 33.33, schoolPercentageSnapshot: 80 },
      { ...base, transactionId: 2, amount: 10.1, schoolPercentageSnapshot: 90, refundedAmount: 0.05 },
      { ...base, transactionId: 3, amount: 50, status: 'refunded', refundedAmount: 50 },
    ]
    const rows = txns.map((t) => toEarningsRow(t))
    const sum = rows.filter((r) => r.status === 'successful').reduce((s, r) => s + r.net, 0)
    const [owed] = computeOwedBalances(
      [{ tenantId: 't', tenantName: 'T', schoolPercentage: 80 }],
      txns.map((t) => ({
        tenantId: 't',
        paymentProvider: t.paymentProvider,
        amount: t.amount,
        refundedAmount: t.refundedAmount,
        currency: t.currency,
        schoolPercentageSnapshot: t.schoolPercentageSnapshot,
        status: t.status as 'successful' | 'refunded',
        transactionDate: t.transactionDate,
      })),
      [],
    )
    expect(Math.round(sum * 100)).toBe(Math.round(owed.balances[0].grossOwed * 100))
  })

  it('filters by status, currency and dates', () => {
    const rows = [
      toEarningsRow(base),
      toEarningsRow({ ...base, transactionId: 2, status: 'pending' }),
      toEarningsRow({ ...base, transactionId: 3, currency: 'eur', transactionDate: '2026-09-01T00:00:00Z' }),
    ]
    const f = { status: 'all' as const, currency: null, from: null, to: null }
    expect(filterEarnings(rows, { ...f, status: 'pending' })).toHaveLength(1)
    expect(filterEarnings(rows, { ...f, status: 'payable' })).toHaveLength(2)
    expect(filterEarnings(rows, { ...f, currency: 'EUR' })).toHaveLength(1)
    expect(filterEarnings(rows, { ...f, from: '2026-10-01', to: '2026-10-05' })).toHaveLength(2)
  })

  it('month total counts only successful rows this month, per currency', () => {
    const rows = [
      toEarningsRow(base),
      toEarningsRow({ ...base, transactionId: 2, status: 'pending' }),
      toEarningsRow({ ...base, transactionId: 3, transactionDate: '2026-09-30T00:00:00Z' }),
    ]
    expect(monthTotals(rows, new Date('2026-10-08T00:00:00Z'))).toEqual({ byCurrency: { USD: 80 }, count: 1 })
  })

  it('paginates and clamps', () => {
    const p = paginate([1, 2, 3, 4, 5], 9, 2)
    expect(p).toMatchObject({ page: 3, totalPages: 3, items: [5] })
  })
})
