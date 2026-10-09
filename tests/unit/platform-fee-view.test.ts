import { describe, expect, it } from 'vitest'
import {
  describeFeeBanner,
  FEE_DIALOG_RAILS,
  feeErrorKey,
  feeRailsFor,
  MIN_CARD_FEE_PAYMENT_USD,
  overpaidByCurrency,
  owedBuckets,
  owedByCurrency,
  parsePayNowAmount,
  payNowBuckets,
  summarizeConvertedSales,
  type FeeStandingSnapshot,
  type FeeTxnWithFx,
} from '@/lib/billing/platform-fee-view'
import { MIN_AUTOMATED_FEE_PAYMENT_USD } from '@/lib/billing/platform-fee-paynow'
import type { FeeBalance } from '@/lib/payments/platform-fee-owed'

const bal = (currency: string, netOwed: number, overpaid = 0): FeeBalance => ({
  currency,
  accrued: netOwed,
  paid: 0,
  netOwed,
  overpaid,
  sales: 1,
})

const standing = (over: Partial<FeeStandingSnapshot> = {}): FeeStandingSnapshot => ({
  state: 'ok',
  overdueSince: null,
  blockedAt: null,
  enforcementExempt: false,
  ...over,
})

describe('owed buckets', () => {
  it('keeps one figure per currency and drops sub-cent residue', () => {
    const balances = [bal('USD', 12.5), bal('EUR', 3), bal('MXN', 0.004), bal('ARS', 0, 2)]
    expect(owedBuckets(balances).map((b) => b.currency)).toEqual(['EUR', 'USD'])
    expect(owedByCurrency(balances)).toEqual({ EUR: 3, USD: 12.5 })
    expect(overpaidByCurrency(balances)).toEqual({ ARS: 2 })
  })
})

describe('pay-now rails', () => {
  it('offers card only for USD at or above the card minimum, and only when Stripe is configured', () => {
    expect(feeRailsFor('USD', 10, { cardConfigured: true })).toEqual(['stripe', 'manual'])
    expect(feeRailsFor('usd', 10, { cardConfigured: true })).toEqual(['stripe', 'manual'])
    expect(feeRailsFor('USD', 10, { cardConfigured: false })).toEqual(['manual'])
    expect(feeRailsFor('USD', 0.49, { cardConfigured: true })).toEqual(['manual'])
    expect(feeRailsFor('EUR', 100, { cardConfigured: true })).toEqual(['manual'])
  })

  it('is capability-driven and matches the route minimum', () => {
    expect(FEE_DIALOG_RAILS).toEqual(['stripe', 'manual'])
    expect(MIN_CARD_FEE_PAYMENT_USD).toBe(MIN_AUTOMATED_FEE_PAYMENT_USD)
  })

  it('builds one pay-now bucket per owed currency', () => {
    expect(payNowBuckets([bal('USD', 20), bal('VES', 0), bal('EUR', 4)], { cardConfigured: true })).toEqual([
      { currency: 'EUR', netOwed: 4, rails: ['manual'] },
      { currency: 'USD', netOwed: 20, rails: ['stripe', 'manual'] },
    ])
  })
})

describe('parsePayNowAmount', () => {
  it('accepts partial amounts up to the balance, 2 decimals, comma or dot', () => {
    expect(parsePayNowAmount('5', 10, 'manual')).toEqual({ ok: true, amount: 5 })
    expect(parsePayNowAmount('5,25', 10, 'manual')).toEqual({ ok: true, amount: 5.25 })
    expect(parsePayNowAmount(' 10.00 ', 10, 'stripe')).toEqual({ ok: true, amount: 10 })
  })

  it('refuses junk, zero, too many decimals and more than owed', () => {
    for (const raw of ['', 'abc', '-1', '0', '1.234', '1e3']) {
      expect(parsePayNowAmount(raw, 10, 'manual')).toEqual({ ok: false, error: 'invalid_amount' })
    }
    expect(parsePayNowAmount('10.01', 10, 'manual')).toEqual({ ok: false, error: 'amount_above_balance' })
  })

  it('applies the card minimum only on the card rail', () => {
    expect(parsePayNowAmount('0.30', 10, 'stripe')).toEqual({ ok: false, error: 'amount_below_minimum' })
    expect(parsePayNowAmount('0.30', 10, 'manual')).toEqual({ ok: true, amount: 0.3 })
  })
})

describe('summarizeConvertedSales', () => {
  const txn = (over: Partial<FeeTxnWithFx>): FeeTxnWithFx => ({
    paymentProvider: 'manual',
    amount: 3650,
    refundedAmount: null,
    currency: 'VES',
    schoolPercentageSnapshot: 80,
    status: 'successful',
    transactionDate: '2026-09-10T00:00:00Z',
    usdAmount: 100,
    fxRateToUsd: 0.0274,
    fxRateSource: 'bcv',
    ...over,
  })

  it('groups converted sales per sale currency with the stored rates, newest first, deduplicated', () => {
    const lines = summarizeConvertedSales([
      txn({ transactionDate: '2026-09-01T00:00:00Z' }),
      txn({ transactionDate: '2026-09-20T00:00:00Z', fxRateToUsd: 0.025, fxRateSource: 'bcv:stale' }),
      txn({ transactionDate: '2026-09-05T00:00:00Z' }),
      txn({ currency: 'USD', usdAmount: null, amount: 10 }), // not converted
    ])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ currency: 'VES', count: 3, salesTotal: 10950, usdTotal: 300 })
    expect(lines[0].rates.map((r) => [r.rate, r.source])).toEqual([
      [0.025, 'bcv:stale'],
      [0.0274, 'bcv'],
    ])
  })

  it('converts a partial refund at the stored rate, never re-converting', () => {
    const [line] = summarizeConvertedSales([txn({ refundedAmount: 1825 })])
    expect(line.salesTotal).toBe(1825)
    expect(line.usdTotal).toBe(50)
  })

  it('ignores ineligible rails, unconverted rows and caps the rate list', () => {
    expect(summarizeConvertedSales([txn({ paymentProvider: 'stripe' })])).toEqual([])
    expect(summarizeConvertedSales([txn({ usdAmount: null })])).toEqual([])
    const many = [1, 2, 3, 4, 5].map((i) => txn({ fxRateToUsd: i / 100, transactionDate: `2026-09-0${i}T00:00:00Z` }))
    expect(summarizeConvertedSales(many)[0].rates).toHaveLength(3)
  })
})

describe('describeFeeBanner', () => {
  const base = {
    balances: [bal('USD', 25), bal('EUR', 4)],
    enforcementMode: 'enforce' as const,
    graceDays: 7,
    latestDueAt: '2026-10-04T00:00:00Z',
  }

  it('renders nothing while ok, unknown, or when nothing is owed', () => {
    expect(describeFeeBanner({ ...base, standing: null })).toBeNull()
    expect(describeFeeBanner({ ...base, standing: standing() })).toBeNull()
    expect(describeFeeBanner({ ...base, balances: [bal('USD', 0, 3)], standing: standing({ state: 'overdue', overdueSince: '2026-10-05T00:00:00Z' }) })).toBeNull()
  })

  it('reminded carries the due date and per-currency amounts', () => {
    expect(describeFeeBanner({ ...base, standing: standing({ state: 'reminded' }) })).toEqual({
      variant: 'reminded',
      owed: { EUR: 4, USD: 25 },
      dueAt: '2026-10-04T00:00:00Z',
      blockOn: null,
    })
  })

  it('overdue states when sales pause only in enforce mode and when not exempt', () => {
    const overdue = standing({ state: 'overdue', overdueSince: '2026-10-05T00:00:00.000Z' })
    expect(describeFeeBanner({ ...base, standing: overdue })?.blockOn).toBe('2026-10-12T00:00:00.000Z')
    expect(describeFeeBanner({ ...base, enforcementMode: 'notify_only', standing: overdue })).toMatchObject({ variant: 'overdue', blockOn: null })
    expect(describeFeeBanner({ ...base, standing: { ...overdue, enforcementExempt: true } })?.blockOn).toBeNull()
  })

  it('blocked wins whenever blocked_at is set', () => {
    expect(
      describeFeeBanner({ ...base, standing: standing({ state: 'blocked', overdueSince: '2026-10-05T00:00:00Z', blockedAt: '2026-10-13T00:00:00Z' }) }),
    ).toMatchObject({ variant: 'blocked' })
  })
})

describe('feeErrorKey', () => {
  it('maps known codes and falls back to generic', () => {
    expect(feeErrorKey('nothing_owed', ['nothing_owed'])).toBe('nothing_owed')
    expect(feeErrorKey('weird', ['nothing_owed'])).toBe('generic')
    expect(feeErrorKey(undefined, ['nothing_owed'])).toBe('generic')
  })
})
