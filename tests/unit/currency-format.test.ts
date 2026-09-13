import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/lib/currency'

/**
 * #727: six screens guessed the symbol with `currency === 'usd' ? '$' : '€'`,
 * so COP/MXN/VES/BRL all read as euros. They now format through
 * `formatCurrency()`; these pin what that means for the LATAM currencies.
 */
describe('formatCurrency (manual-payment screens)', () => {
  it.each(['cop', 'mxn', 'brl', 'ves', 'pen', 'ars'])('%s never renders as euros', (currency) => {
    expect(formatCurrency(120000, currency, 'es')).not.toContain('€')
    expect(formatCurrency(120000, currency, 'en')).not.toContain('€')
  })

  it('COP carries its own code in en', () => {
    expect(formatCurrency(120000, 'cop', 'en')).toMatch(/COP/)
  })

  it('euros still read as euros', () => {
    expect(formatCurrency(10, 'eur', 'en')).toContain('€')
  })

  it('zero-decimal currencies carry no cents', () => {
    expect(formatCurrency(5000, 'clp', 'en')).not.toMatch(/\.00/)
  })

  it('accepts an upper-case code', () => {
    expect(formatCurrency(10, 'USD', 'en')).toBe('$10.00')
  })
})
