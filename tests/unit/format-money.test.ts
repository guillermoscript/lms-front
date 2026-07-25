import { describe, it, expect } from 'vitest'
import { formatByCurrency, formatMoney, sumByCurrency } from '@/lib/payments/format-money'

/**
 * The rule under test is the one #497 established and #531 found broken on the
 * school-facing payout history: payout amounts are grouped per currency and
 * never added across currencies, and the currency code always comes from the
 * data. Formatting assertions use `toContain` on the digits plus a separate
 * symbol check, so a change in ICU's spacing or grouping doesn't produce a false
 * failure about arithmetic.
 */

const rows = (...pairs: Array<[number | null, string | null]>) =>
  pairs.map(([amount, currency]) => ({ amount, currency }))

describe('sumByCurrency', () => {
  it('keeps each currency in its own bucket', () => {
    expect(sumByCurrency(rows([1240.5, 'usd'], [860, 'eur']))).toEqual({ USD: 1240.5, EUR: 860 })
  })

  it('sums multiple rows within one currency', () => {
    expect(sumByCurrency(rows([100, 'usd'], [25.5, 'usd'], [10, 'eur']))).toEqual({
      USD: 125.5,
      EUR: 10,
    })
  })

  it('treats currency codes case-insensitively so one currency never splits into two lines', () => {
    expect(sumByCurrency(rows([100, 'usd'], [50, 'USD'], [1, 'Usd']))).toEqual({ USD: 151 })
  })

  it('buckets a null currency as USD (the payouts.currency column default) rather than dropping the row', () => {
    expect(sumByCurrency(rows([40, null], [60, 'usd']))).toEqual({ USD: 100 })
  })

  it('treats a null amount as zero', () => {
    expect(sumByCurrency(rows([null, 'usd'], [10, 'usd']))).toEqual({ USD: 10 })
  })

  it('returns an empty object for no rows', () => {
    expect(sumByCurrency([])).toEqual({})
  })

  it('never produces a total larger than any single currency bucket (the #531 regression)', () => {
    const totals = sumByCurrency(rows([1240.5, 'usd'], [860, 'eur']))
    // The bug summed these to 2100.5 and labelled it USD. No bucket may hold that.
    expect(Object.values(totals)).not.toContain(2100.5)
    expect(totals.USD).toBe(1240.5)
  })
})

describe('formatMoney', () => {
  it('formats with the currency it is given, not a hardcoded one', () => {
    expect(formatMoney(860, 'eur', 'en')).toContain('860')
    expect(formatMoney(860, 'eur', 'en')).toContain('€')
    expect(formatMoney(1240.5, 'usd', 'en')).toContain('$')
  })

  it('accepts lower-case codes', () => {
    expect(formatMoney(10, 'gbp', 'en')).toContain('£')
  })

  it('falls back to USD for a missing currency and to zero for a missing amount', () => {
    expect(formatMoney(10, null, 'en')).toContain('$')
    expect(formatMoney(null, 'usd', 'en')).toContain('0')
  })

  it('respects the reader locale', () => {
    // es-ES puts the symbol after the number; the point is that locale is honoured,
    // not which side it lands on.
    expect(formatMoney(1240.5, 'eur', 'es')).toContain('€')
  })
})

describe('formatByCurrency', () => {
  it('renders one figure per currency instead of a single mixed number', () => {
    const rendered = formatByCurrency({ USD: 1240.5, EUR: 860 }, 'en')
    expect(rendered).toContain('$')
    expect(rendered).toContain('€')
    expect(rendered).toContain('1,240.50')
    expect(rendered).toContain('860')
    expect(rendered).not.toContain('2,100.50')
  })

  it('renders a single-currency school as one plain figure', () => {
    const rendered = formatByCurrency({ USD: 1240.5 }, 'en')
    expect(rendered).toContain('$1,240.50')
    expect(rendered).not.toContain('·')
  })

  it('drops currencies that net to zero', () => {
    const rendered = formatByCurrency({ USD: 100, EUR: 0 }, 'en')
    expect(rendered).toContain('$100')
    expect(rendered).not.toContain('€')
  })

  it('renders one zero rather than an empty card when there is nothing to show', () => {
    expect(formatByCurrency({}, 'en')).toContain('0')
    expect(formatByCurrency({ USD: 0, EUR: 0 }, 'en')).toContain('0')
  })

  it('composes with sumByCurrency end to end for the #531 case', () => {
    const paid = rows([1240.5, 'usd'], [860, 'eur'])
    const rendered = formatByCurrency(sumByCurrency(paid), 'en')
    expect(rendered).toBe('$1,240.50 · €860.00')
  })
})
