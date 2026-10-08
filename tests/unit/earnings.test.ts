import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeFeeBalances } from '@/lib/payments/platform-fee-owed'
import { computeOwedBalances } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import {
  accruePlatformFees,
  buildEarningsView,
  earningsTxnFromRow,
  EARNINGS_TXN_COLUMNS,
  collectorOf,
  EARNINGS_PROVIDERS,
  filterEarnings,
  monthTotals,
  paginate,
  parseEarningsQuery,
  PLATFORM_COLLECTED_PROVIDERS,
  SCHOOL_COLLECTED_PROVIDERS,
  toEarningsRow,
  utcMonthStart,
  type EarningsRow,
  type EarningsTxn,
  type EarningsViewInput,
} from '@/lib/payments/earnings'

const base: EarningsTxn = {
  transactionId: 1, paymentProvider: 'manual', amount: 100, refundedAmount: 0, currency: 'usd',
  schoolPercentageSnapshot: 80, status: 'successful', transactionDate: '2026-10-05T12:00:00Z',
}
const row = (over: Partial<EarningsTxn> = {}) => toEarningsRow({ ...base, ...over }) as EarningsRow
const allFilters = { status: 'all' as const, collector: 'all' as const, currency: null, from: null, to: null }

describe('provider scope (capability map, never applies_to_providers)', () => {
  it('school-collected = every rail where the platform takes no fee in flight', () => {
    for (const p of Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]) {
      expect(SCHOOL_COLLECTED_PROVIDERS.includes(p)).toBe(!PROVIDER_CAPABILITIES[p].bearsPlatformFee)
    }
    expect([...SCHOOL_COLLECTED_PROVIDERS].sort()).toEqual(['binance_personal', 'manual'])
  })

  it('platform-collected = settles to the platform account; Stripe and Solana are out of scope', () => {
    expect([...PLATFORM_COLLECTED_PROVIDERS].sort()).toEqual(['binance', 'lemonsqueezy', 'paypal'])
    for (const p of ['stripe', 'solana', 'solana_subs']) {
      expect(EARNINGS_PROVIDERS).not.toContain(p)
      expect(collectorOf(p)).toBeNull()
    }
  })

  it('the two sets are disjoint, so no sale is counted in both directions', () => {
    expect(SCHOOL_COLLECTED_PROVIDERS.filter((p) => PLATFORM_COLLECTED_PROVIDERS.includes(p))).toEqual([])
  })
})

describe('toEarningsRow', () => {
  it('splits commission and net using the snapshot, net of partial refunds', () => {
    const r = row({ refundedAmount: 20 })
    expect(r).toMatchObject({ kept: 80, net: 64, commission: 16, collectedBy: 'school', currencyCode: 'USD' })
  })

  it('falls back to the given split without a snapshot', () => {
    expect(row({ schoolPercentageSnapshot: null }).net).toBe(80)
    expect(toEarningsRow({ ...base, schoolPercentageSnapshot: null }, 90)!.commission).toBe(10)
  })

  it('rounds per row so .99 prices leave no residue', () => {
    const r = row({ amount: 49.99 })
    expect(r.net).toBe(39.99)
    expect(r.commission).toBe(10)
    expect(Math.round((r.net + r.commission) * 100)).toBe(4999)
  })

  it('returns null for a provider outside both scopes', () => {
    expect(toEarningsRow({ ...base, paymentProvider: 'stripe' })).toBeNull()
  })
})

describe('accruePlatformFees (debt the school owes the platform)', () => {
  it('sums commission on school-collected, counted rows only, per currency', () => {
    const debt = accruePlatformFees([
      row({ transactionId: 1 }), // 20
      row({ transactionId: 2, paymentProvider: 'binance_personal', amount: 50 }), // 10
      row({ transactionId: 3, refundedAmount: 40 }), // 12
      row({ transactionId: 4, status: 'refunded', refundedAmount: 100 }), // 0, excluded
      row({ transactionId: 5, refundedAmount: 100 }), // successful but fully refunded, excluded
      row({ transactionId: 6, status: 'pending' }), // not settled
      row({ transactionId: 7, paymentProvider: 'paypal' }), // platform collected, other direction
      row({ transactionId: 8, currency: 'eur', amount: 10 }), // 2 EUR
    ])
    expect(debt).toEqual([
      { currency: 'EUR', accrued: 2, paid: 0, netOwed: 2, sales: 1 },
      { currency: 'USD', accrued: 42, paid: 0, netOwed: 42, sales: 3 },
    ])
  })

  it('accrues a student-borne (grossed-up) sale on the amount the buyer paid', () => {
    // $100 listed, student bears a 20% fee -> charged $125, platform keeps $25.
    const debt = accruePlatformFees([row({ transactionId: 9, amount: 125 })])
    expect(debt).toEqual([{ currency: 'USD', accrued: 25, paid: 0, netOwed: 25, sales: 1 }])
  })

  it('is empty without school-collected sales', () => {
    expect(accruePlatformFees([row({ paymentProvider: 'paypal' })])).toEqual([])
  })
})

describe('filterEarnings', () => {
  const rows = [
    row({ transactionId: 1 }),
    row({ transactionId: 2, status: 'pending' }),
    row({ transactionId: 3, currency: 'eur', transactionDate: '2026-09-01T00:00:00Z' }),
    row({ transactionId: 4, status: 'refunded', refundedAmount: 100 }),
    row({ transactionId: 5, refundedAmount: 100 }),
    row({ transactionId: 6, refundedAmount: 10, paymentProvider: 'paypal' }),
  ]
  const ids = (rs: EarningsRow[]) => rs.map((r) => r.transactionId)

  it('"counted" excludes pending and fully refunded rows (either shape)', () => {
    expect(ids(filterEarnings(rows, { ...allFilters, status: 'counted' }))).toEqual([1, 3, 6])
  })
  it('"pending" and "refunded"', () => {
    expect(ids(filterEarnings(rows, { ...allFilters, status: 'pending' }))).toEqual([2])
    expect(ids(filterEarnings(rows, { ...allFilters, status: 'refunded' }))).toEqual([4, 5, 6])
  })
  it('collector, currency and UTC-inclusive dates', () => {
    expect(ids(filterEarnings(rows, { ...allFilters, collector: 'platform' }))).toEqual([6])
    expect(ids(filterEarnings(rows, { ...allFilters, currency: 'eur' }))).toEqual([3])
    expect(ids(filterEarnings(rows, { ...allFilters, from: '2026-10-05', to: '2026-10-05' }))).toEqual([1, 2, 4, 5, 6])
    expect(ids(filterEarnings(rows, { ...allFilters, to: '2026-09-01' }))).toEqual([3])
  })
})

type Msgs = { dashboard: { admin: { earnings: { stats: { month: string } } } } }

describe('month (UTC)', () => {
  it('month starts at 00:00 UTC on the 1st regardless of host zone', () => {
    expect(new Date(utcMonthStart(new Date('2026-10-31T23:30:00-05:00'))).toISOString()).toBe('2026-11-01T00:00:00.000Z')
  })

  it('totals counted rows in this UTC month, per currency, both collectors', () => {
    const m = monthTotals(
      [
        row({ transactionId: 1 }),
        row({ transactionId: 2, status: 'pending' }),
        row({ transactionId: 3, transactionDate: '2026-09-30T23:59:59Z' }),
        row({ transactionId: 4, paymentProvider: 'paypal', schoolPercentageSnapshot: 90 }),
        row({ transactionId: 5, refundedAmount: 100 }),
      ],
      new Date('2026-10-08T00:00:00Z'),
    )
    expect(m).toEqual({ sales: { USD: 200 }, commission: { USD: 30 }, net: { USD: 170 }, count: 2 })
  })
})

describe('paginate / parseEarningsQuery', () => {
  it('paginates and clamps', () => {
    expect(paginate([1, 2, 3, 4, 5], 9, 2)).toMatchObject({ page: 3, totalPages: 3, items: [5] })
  })
  it('drops unknown values', () => {
    expect(
      parseEarningsQuery({ status: 'payable', collector: 'x', currency: 'jpy', from: '2026-13-40', to: '2026-10-01', page: '2' }, ['USD']),
    ).toEqual({ status: 'all', collector: 'all', currency: null, from: null, to: '2026-10-01', page: 2 })
  })
})

describe('buildEarningsView (page assembly)', () => {
  const input = (over: Partial<EarningsViewInput> = {}): EarningsViewInput => ({
    tenantId: 't1',
    txns: [
      { ...base, transactionId: 1, amount: 49.99 },
      { ...base, transactionId: 2, paymentProvider: 'binance_personal', amount: 30, transactionDate: '2026-09-15T00:00:00Z' },
      { ...base, transactionId: 3, status: 'pending' },
      { ...base, transactionId: 4, status: 'refunded', refundedAmount: 100 },
      { ...base, transactionId: 5, paymentProvider: 'paypal', amount: 200, schoolPercentageSnapshot: 90 },
      { ...base, transactionId: 6, paymentProvider: 'lemonsqueezy', amount: 20, currency: 'eur' },
      { ...base, transactionId: 7, paymentProvider: 'stripe', amount: 999 },
    ],
    payouts: [{ amount: 50, currency: 'usd', coveredThrough: '2026-10-01T00:00:00Z' }],
    schoolPercentage: 80,
    openRequests: 3,
    now: new Date('2026-10-08T12:00:00Z'),
    searchParams: {},
    pageSize: 4,
    ...over,
  })

  it('debt is commission on direct sales only, per currency, with paid = 0', () => {
    const v = buildEarningsView(input())
    // 49.99 → 10.00 commission ; 30 → 6.00
    expect(v.feeDebt).toEqual([{ currency: 'USD', accrued: 16, paid: 0, netOwed: 16, sales: 2 }])
    expect(v.hasSchoolCollectedSales).toBe(true)
  })

  it('platform-owes side equals computeOwedBalances over platform-collected rows minus payouts, never netted with the debt', () => {
    const v = buildEarningsView(input())
    const [owed] = computeOwedBalances(
      [{ tenantId: 't1', tenantName: '', schoolPercentage: 80 }],
      [
        { tenantId: 't1', paymentProvider: 'paypal', amount: 200, currency: 'USD', schoolPercentageSnapshot: 90, status: 'successful', transactionDate: base.transactionDate, refundedAmount: 0 },
        { tenantId: 't1', paymentProvider: 'lemonsqueezy', amount: 20, currency: 'EUR', schoolPercentageSnapshot: 80, status: 'successful', transactionDate: base.transactionDate, refundedAmount: 0 },
      ],
      [{ tenantId: 't1', amount: 50, currency: 'USD', coveredThrough: '2026-10-01T00:00:00Z' }],
    )
    const expected = Object.fromEntries(owed.balances.map((b) => [b.currency, b.netOwed]))
    expect(v.platformOwes).toEqual(expected)
    expect(v.platformOwes).toEqual({ USD: 130, EUR: 16 })
  })

  it('this month, open requests, currencies, and Stripe never listed', () => {
    const v = buildEarningsView(input())
    expect(v.month.count).toBe(3) // 1, 5, 6 — #2 is September, #3 pending, #4 refunded
    expect(v.month.net).toEqual({ USD: 219.99, EUR: 16 })
    expect(v.openRequests).toBe(3)
    expect(v.currencies).toEqual(['EUR', 'USD'])
    expect(v.page.total).toBe(6)
    expect(v.page.items.map((r) => r.transactionId)).not.toContain(7)
  })

  it('month scope spans both collectors while the debt is school-collected only', () => {
    const v = buildEarningsView(input())
    const debtSales = v.feeDebt.reduce((n, b) => n + b.sales, 0)
    expect(v.month.count).toBeGreaterThan(0)
    expect(debtSales).toBeGreaterThan(0)
    expect(v.month.count).not.toBe(debtSales) // different scopes, different counts
  })

  it('month card label names its scope in en and es', async () => {
    const en = (await import('../../messages/en.json')).default as unknown as Msgs
    const es = (await import('../../messages/es.json')).default as unknown as Msgs
    expect(en.dashboard.admin.earnings.stats.month).toMatch(/all sales/i)
    expect(es.dashboard.admin.earnings.stats.month).toMatch(/todas las ventas/i)
  })

  it('applies query filters and pagination, newest first', () => {
    const v = buildEarningsView(input({ searchParams: { status: 'counted', collector: 'school' } }))
    expect(v.page.items.map((r) => r.transactionId)).toEqual([1, 2])
    const p2 = buildEarningsView(input({ searchParams: { page: '2' } }))
    expect(p2.page).toMatchObject({ page: 2, totalPages: 2 })
    expect(p2.page.items.map((r) => r.transactionId)).toEqual([1, 2])
  })

  it('empty tenant renders zeros, not errors', () => {
    const v = buildEarningsView(input({ txns: [], payouts: [], openRequests: 0 }))
    expect(v).toMatchObject({ feeDebt: [], platformOwes: {}, hasPlatformCollectedSales: false, currencies: [] })
    expect(v.page).toMatchObject({ items: [], page: 1, totalPages: 1 })
  })
})

describe('raw transactions row → EarningsTxn (#929 usd_amount reconcile)', () => {
  const raw = {
    transaction_id: 9, payment_provider: 'manual', amount: '3650.00', refunded_amount: '1825.00', currency: 'ves',
    school_percentage_snapshot: '80', status: 'successful', transaction_date: '2026-10-05T12:00:00Z',
    product_id: 1, plan_id: null, usd_amount: '100.01',
  }

  it('selects and maps usd_amount', () => {
    expect(EARNINGS_TXN_COLUMNS.split(',').map((c) => c.trim())).toContain('usd_amount')
    expect(earningsTxnFromRow(raw)).toMatchObject({ usdAmount: 100.01, amount: 3650, refundedAmount: 1825, schoolPercentageSnapshot: 80 })
    expect(earningsTxnFromRow({ ...raw, usd_amount: null })!.usdAmount).toBeNull()
    expect(earningsTxnFromRow({ ...raw, payment_provider: null })).toBeNull()
  })

  it('a VES sale lands in the same USD bucket as the ledger, not a VES bucket', () => {
    const txn = earningsTxnFromRow(raw)!
    const v = buildEarningsView({
      tenantId: 't1', txns: [txn], payouts: [], schoolPercentage: 80, openRequests: 0,
      now: new Date('2026-10-20T00:00:00Z'), searchParams: {}, pageSize: 20,
    })
    const ledger = computeFeeBalances([txn], [], { fallbackSchoolPercentage: 80 })
    expect(v.feeDebt.map((b) => b.currency)).toEqual(['USD'])
    expect(v.feeDebt[0].netOwed).toBe(ledger[0].netOwed)
    expect(v.feeDebt[0].netOwed).toBe(10) // 20% of 50.01 USD kept (100.01 × 1825/3650 = 50.005 → 50.01)
  })

  it('the earnings page selects through EARNINGS_TXN_COLUMNS and maps through earningsTxnFromRow', () => {
    const src = readFileSync('app/[locale]/dashboard/admin/earnings/page.tsx', 'utf8')
    expect(src).toContain('.select(EARNINGS_TXN_COLUMNS')
    expect(src).toContain('.map(earningsTxnFromRow)')
  })
})
