import { describe, it, expect } from 'vitest'
import { parseStatementLines, statementStatus, STATEMENT_NUMBER_PATTERN } from '@/lib/billing/platform-fee-statement'

/**
 * #929 statement (design 2.5): renders the FROZEN lines written at close —
 * per source currency, never summed across currencies, with the rate and
 * source used for converted (hyperinflation) sales — and a live status from
 * the stateless ledger (D4).
 */

describe('parseStatementLines', () => {
  it('reads the close-phase JSON: per currency, rates + source for converted sales', () => {
    const parsed = parseStatementLines({
      sources: {
        VES: {
          sales_total: 36500,
          sales_count: 2,
          fee: 20,
          converted: true,
          usd_subtotal: 100,
          rates: [
            { rate: 0.00274, source: 'bcv' },
            { rate: 0.0027, source: 'bcv:stale' },
          ],
        },
        USD: { sales_total: 50, sales_count: 1, fee: 10, converted: false },
      },
      payments_total: 5,
      closing_balance: 25,
    })
    expect(parsed.paymentsTotal).toBe(5)
    expect(parsed.closingBalance).toBe(25)
    expect(parsed.lines.map((l) => l.currency)).toEqual(['USD', 'VES'])
    expect(parsed.lines[1]).toEqual({
      currency: 'VES',
      salesTotal: 36500,
      salesCount: 2,
      fee: 20,
      converted: true,
      usdSubtotal: 100,
      rates: [
        { rate: 0.00274, source: 'bcv' },
        { rate: 0.0027, source: 'bcv:stale' },
      ],
    })
    expect(parsed.lines[0]).toMatchObject({ converted: false, usdSubtotal: null, rates: [] })
  })

  it('tolerates an empty or malformed lines value', () => {
    expect(parseStatementLines(null)).toEqual({ lines: [], paymentsTotal: null, closingBalance: null })
    expect(parseStatementLines({ sources: { usd: { rates: 'x' } } }).lines[0]).toMatchObject({ currency: 'USD', fee: 0, rates: [] })
  })
})

describe('statementStatus', () => {
  const due = '2026-10-04T00:00:00.000Z'
  it('paid when everything through the period is covered (half-cent epsilon)', () => {
    expect(statementStatus(0, due, new Date('2026-12-01'))).toBe('paid')
    expect(statementStatus(0.004, due, new Date('2026-12-01'))).toBe('paid')
  })
  it('due before due_at, overdue after', () => {
    expect(statementStatus(10, due, new Date('2026-10-03T12:00:00Z'))).toBe('due')
    expect(statementStatus(10, due, new Date('2026-10-04T00:00:01Z'))).toBe('overdue')
  })
})

describe('statement number', () => {
  it('only PF-YYYYMM-<seq> is looked up', () => {
    expect(STATEMENT_NUMBER_PATTERN.test('PF-202609-12')).toBe(true)
    expect(STATEMENT_NUMBER_PATTERN.test('INV-202609-12')).toBe(false)
    expect(STATEMENT_NUMBER_PATTERN.test("PF-202609-1' or 1=1")).toBe(false)
  })
})
