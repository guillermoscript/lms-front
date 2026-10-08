import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SCHOOL_PERCENTAGE, MONEY_EPSILON } from '@/lib/payments/payouts-owed'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import {
  computeFeeBalances,
  DEFAULT_HYPERINFLATION_CURRENCIES,
  FEE_DUE_DAYS,
  FEE_LEDGER_PROVIDERS,
  feeForTxn,
  isFeeLedgerProvider,
  isFeeOverdue,
  latestFeeDueBoundary,
  overdueFeeBalances,
  type FeeLedgerTxn,
  type FeePayment,
} from '@/lib/payments/platform-fee-owed'

const MIGRATION = readFileSync(
  join(__dirname, '../../supabase/migrations/20261009100000_platform_fee_ledger_929.sql'),
  'utf8',
)

const base: FeeLedgerTxn = {
  paymentProvider: 'manual',
  amount: 100,
  refundedAmount: 0,
  currency: 'usd',
  schoolPercentageSnapshot: 80,
  status: 'successful',
  transactionDate: '2026-10-05T12:00:00Z',
}
const txn = (over: Partial<FeeLedgerTxn> = {}): FeeLedgerTxn => ({ ...base, ...over })
const paid = (amount: number, currency = 'USD', status = 'succeeded'): FeePayment => ({ amount, currency, status })

describe('provider eligibility (D10, R4)', () => {
  it('matrix over PROVIDER_CAPABILITIES: only rails with no fee in flight accrue', () => {
    for (const p of Object.keys(PROVIDER_CAPABILITIES) as PaymentProvider[]) {
      expect(isFeeLedgerProvider(p)).toBe(!PROVIDER_CAPABILITIES[p].bearsPlatformFee)
      expect(feeForTxn(txn({ paymentProvider: p })) != null).toBe(!PROVIDER_CAPABILITIES[p].bearsPlatformFee)
    }
    expect([...FEE_LEDGER_PROVIDERS].sort()).toEqual(['binance_personal', 'manual'])
  })

  it('unknown or missing slugs never accrue', () => {
    expect(isFeeLedgerProvider('bank_transfer')).toBe(false)
    expect(isFeeLedgerProvider(null)).toBe(false)
  })

  it('the SQL mirror in the migration uses the same rail list', () => {
    const m = MIGRATION.match(/t\.payment_provider IN \(([^)]*)\)/)
    expect(m).not.toBeNull()
    const sqlList = m![1].split(',').map((s) => s.trim().replace(/'/g, '')).sort()
    expect(sqlList).toEqual([...FEE_LEDGER_PROVIDERS].sort())
  })
})

describe('feeForTxn (per row)', () => {
  it('fee = kept - roundMoney(kept x snapshot), net of a partial refund', () => {
    expect(feeForTxn(txn({ refundedAmount: 20 }))).toMatchObject({ kept: 80, base: 80, fee: 16, ledgerCurrency: 'USD' })
  })

  it('.99 prices at odd splits leave no residue', () => {
    for (const pct of [80, 85, 90, 97.5, 33]) {
      for (const amount of [49.99, 9.99, 0.99, 1234.99]) {
        const line = feeForTxn(txn({ amount, schoolPercentageSnapshot: pct }))!
        expect(Math.round(line.fee * 100)).toBe(line.fee * 100)
        // fee + school share = kept, to the cent
        const share = Math.round(line.kept * 100) - Math.round(line.fee * 100)
        expect(share).toBe(Math.round(Math.round(((amount * pct) / 100) * 100 + 1e-9)))
      }
    }
    expect(feeForTxn(txn({ amount: 49.99 }))!.fee).toBe(10)
  })

  it('uses the row snapshot, not the current split', () => {
    expect(feeForTxn(txn({ schoolPercentageSnapshot: 90 }), { fallbackSchoolPercentage: 50 })!.fee).toBe(10)
  })

  it('legacy NULL snapshot falls back to the current split, else DEFAULT_SCHOOL_PERCENTAGE', () => {
    expect(feeForTxn(txn({ schoolPercentageSnapshot: null }), { fallbackSchoolPercentage: 95 })!.fee).toBe(5)
    expect(DEFAULT_SCHOOL_PERCENTAGE).toBe(80)
    expect(feeForTxn(txn({ schoolPercentageSnapshot: null }))!.fee).toBe(20)
  })

  it('skips full refunds (both shapes), pending, free and ineligible rows', () => {
    expect(feeForTxn(txn({ status: 'refunded', refundedAmount: 100 }))).toBeNull()
    expect(feeForTxn(txn({ refundedAmount: 100 }))).toBeNull()
    expect(feeForTxn(txn({ status: 'pending' }))).toBeNull()
    expect(feeForTxn(txn({ amount: 0 }))).toBeNull()
    expect(feeForTxn(txn({ paymentProvider: 'stripe' }))).toBeNull()
  })

  it('a student-borne (grossed-up, #927) sale accrues on what the buyer paid', () => {
    expect(feeForTxn(txn({ amount: 125 }))!.fee).toBe(25)
  })
})

describe('hyperinflation currencies (D6, R13)', () => {
  it('default list is VES', () => {
    expect(DEFAULT_HYPERINFLATION_CURRENCIES).toEqual(['VES'])
  })

  it('VES is tracked in USD from the stored snapshot, never re-converted', () => {
    // 3650 VES at a stored 0.0274 USD/VES -> usd_amount 100.01
    const line = feeForTxn(txn({ currency: 'ves', amount: 3650, usdAmount: 100.01 }))!
    expect(line).toMatchObject({ ledgerCurrency: 'USD', sourceCurrency: 'VES', base: 100.01, converted: true })
    expect(line.fee).toBe(20) // 100.01 - roundMoney(80.008)
  })

  it('a partial refund is converted at the stored rate', () => {
    // half refunded -> usd_net = roundMoney(100.01 x 1825 / 3650) = 50.01 (half away from zero)
    const line = feeForTxn(txn({ currency: 'VES', amount: 3650, refundedAmount: 1825, usdAmount: 100.01 }))!
    expect(line.base).toBe(50.01)
    expect(line.fee).toBe(10) // 50.01 - 40.01
  })

  it('a hyperinflation row without a snapshot keeps its own bucket', () => {
    expect(feeForTxn(txn({ currency: 'ves', amount: 3650 }))).toMatchObject({ ledgerCurrency: 'VES', converted: false, fee: 730 })
  })

  it('the configured list decides, case-insensitively', () => {
    expect(feeForTxn(txn({ currency: 'eur', amount: 10, usdAmount: 11 }), { hyperinflationCurrencies: ['eur'] })!.ledgerCurrency).toBe('USD')
    expect(feeForTxn(txn({ currency: 'eur', amount: 10, usdAmount: 11 }))!.ledgerCurrency).toBe('EUR')
  })
})

describe('computeFeeBalances (2.2)', () => {
  it('groups per ledger currency, never summed across', () => {
    const b = computeFeeBalances([
      txn(), // 20
      txn({ amount: 49.99 }), // 10
      txn({ paymentProvider: 'binance_personal', amount: 30, refundedAmount: 10 }), // 4
      txn({ currency: 'eur', amount: 10 }), // 2 EUR
      txn({ currency: 'ves', amount: 3650, usdAmount: 100.01 }), // 20 USD
      txn({ paymentProvider: 'paypal', amount: 999 }),
    ])
    expect(b).toEqual([
      { currency: 'EUR', accrued: 2, paid: 0, netOwed: 2, overpaid: 0, sales: 1 },
      { currency: 'USD', accrued: 54, paid: 0, netOwed: 54, overpaid: 0, sales: 4 },
    ])
  })

  it('matches the SQL mirror figures (supabase/tests/platform_fee_ledger.test.sql)', () => {
    const rows = [
      txn(),
      txn({ amount: 49.99 }),
      txn({ paymentProvider: 'binance_personal', amount: 30, refundedAmount: 10 }),
      txn({ status: 'refunded', amount: 50, refundedAmount: 50 }),
      txn({ paymentProvider: 'stripe', amount: 999 }),
      txn({ paymentProvider: 'paypal', amount: 200, schoolPercentageSnapshot: 90 }),
      txn({ status: 'pending' }),
      txn({ amount: 0 }),
      txn({ currency: 'eur', amount: 10 }),
    ]
    expect(computeFeeBalances(rows).map(({ currency, accrued, sales }) => [currency, accrued, sales])).toEqual([
      ['EUR', 2, 1],
      ['USD', 34, 3],
    ])
    const converted = [...rows, txn({ currency: 'eur', amount: 10, refundedAmount: 5, usdAmount: 11 })]
    expect(
      computeFeeBalances(converted, [], { hyperinflationCurrencies: ['EUR'] }).map(({ currency, accrued, sales }) => [currency, accrued, sales]),
    ).toEqual([
      ['EUR', 2, 1],
      ['USD', 35.1, 4],
    ])
  })

  it('only succeeded payments count, per currency', () => {
    const [usd] = computeFeeBalances([txn()], [paid(5), paid(100, 'usd', 'pending'), paid(100, 'USD', 'failed'), paid(3, 'eur')])
      .filter((b) => b.currency === 'USD')
    expect(usd).toMatchObject({ accrued: 20, paid: 5, netOwed: 15, overpaid: 0 })
  })

  it('overpayment carries forward and is absorbed by later accruals', () => {
    const refundedAfterPay = computeFeeBalances([txn({ refundedAmount: 50 })], [paid(20)])
    expect(refundedAfterPay[0]).toMatchObject({ accrued: 10, paid: 20, netOwed: 0, overpaid: 10 })
    const later = computeFeeBalances([txn({ refundedAmount: 50 }), txn({ amount: 75 })], [paid(20)])
    expect(later[0]).toMatchObject({ accrued: 25, netOwed: 5, overpaid: 0 })
  })

  it('a payment with no accrual in its currency is all overpaid', () => {
    expect(computeFeeBalances([], [paid(7, 'eur')])).toEqual([
      { currency: 'EUR', accrued: 0, paid: 7, netOwed: 0, overpaid: 7, sales: 0 },
    ])
  })

  it('residue at or below MONEY_EPSILON reads as settled, not owed', () => {
    // Accrued 10.00 on 49.99; a payment of 9.996 cannot exist (NUMERIC(10,2)), but a
    // float residue must still not show as owed.
    const [b] = computeFeeBalances([txn({ amount: 49.99 })], [paid(9.996)])
    expect(b.netOwed).toBe(0)
    expect(MONEY_EPSILON).toBe(0.005)
    expect(computeFeeBalances([txn({ amount: 49.99 })], [paid(9.98)])[0].netOwed).toBe(0.02)
  })

  it('accruedBefore limits accruals by transactionDate; payments stay all-time', () => {
    const b = computeFeeBalances(
      [txn({ transactionDate: '2026-08-31T23:59:59Z' }), txn({ transactionDate: '2026-09-01T00:00:00Z' })],
      [paid(5)],
      { accruedBefore: Date.parse('2026-09-01T00:00:00Z') },
    )
    expect(b[0]).toMatchObject({ accrued: 20, paid: 5, netOwed: 15, sales: 1 })
  })
})

describe('overdue (D4, stateless)', () => {
  it('due FEE_DUE_DAYS after the 1st, UTC; strictly after the due instant', () => {
    expect(FEE_DUE_DAYS).toBe(3)
    expect(latestFeeDueBoundary(new Date('2026-10-04T00:00:00Z'))).toEqual({
      accrualCutoff: new Date('2026-09-01T00:00:00Z'),
      dueAt: new Date('2026-09-04T00:00:00Z'),
    })
    expect(latestFeeDueBoundary(new Date('2026-10-04T00:00:01Z'))).toEqual({
      accrualCutoff: new Date('2026-10-01T00:00:00Z'),
      dueAt: new Date('2026-10-04T00:00:00Z'),
    })
    expect(latestFeeDueBoundary(new Date('2026-01-02T00:00:00Z')).accrualCutoff).toEqual(new Date('2025-12-01T00:00:00Z'))
  })

  const sep = txn({ transactionDate: '2026-09-15T00:00:00Z' }) // 20, due 2026-10-04
  const oct = txn({ transactionDate: '2026-10-02T00:00:00Z' }) // 20, due 2026-11-04

  it('not overdue until the due instant has passed', () => {
    expect(isFeeOverdue([sep], [], new Date('2026-10-03T23:00:00Z'))).toBe(false)
    expect(overdueFeeBalances([sep, oct], [], new Date('2026-10-05T00:00:00Z'))).toEqual([
      { currency: 'USD', overdue: 20, dueAt: new Date('2026-10-04T00:00:00Z') },
    ])
  })

  it('paying the overdue part clears it even while the current month still accrues', () => {
    const now = new Date('2026-10-05T00:00:00Z')
    expect(isFeeOverdue([sep, oct], [paid(19.99)], now)).toBe(true)
    expect(isFeeOverdue([sep, oct], [paid(20)], now)).toBe(false)
    expect(computeFeeBalances([sep, oct], [paid(20)])[0].netOwed).toBe(20)
  })

  it('every currency bucket is tested on its own', () => {
    const now = new Date('2026-10-05T00:00:00Z')
    const eur = txn({ currency: 'eur', amount: 10, transactionDate: '2026-09-15T00:00:00Z' })
    expect(overdueFeeBalances([sep, eur], [paid(20)], now).map((b) => b.currency)).toEqual(['EUR'])
  })
})

describe('migration defaults mirror the decided values', () => {
  it('notify_only, grace 7, min 1.00, {VES}', () => {
    expect(MIGRATION).toMatch(/enforcement_mode text NOT NULL DEFAULT 'notify_only'/)
    expect(MIGRATION).toMatch(/fee_grace_days integer NOT NULL DEFAULT 7\b/)
    expect(MIGRATION).toMatch(/min_blocking_balance numeric\(10,2\) NOT NULL DEFAULT 1\.00\b/)
    expect(MIGRATION).toMatch(/hyperinflation_currencies text\[\] NOT NULL DEFAULT '\{VES\}'/)
    expect(MIGRATION).toMatch(/_month_start \+ interval '3 days'/)
  })

  it('creates no trigger on transactions INSERT (the sales gate ships with the renewal exemption)', () => {
    expect(MIGRATION).not.toMatch(/BEFORE INSERT ON public\.transactions/i)
    expect(MIGRATION).not.toMatch(/LM003/)
  })
})
