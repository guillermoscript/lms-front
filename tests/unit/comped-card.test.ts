import { describe, it, expect } from 'vitest'
import { buildCompedCardModel, formatFeePercent } from '@/lib/billing/comped-card'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

const NOW = new Date('2026-10-20T12:00:00Z')

type Cat = { dashboard: { admin: { billing: { comped: Record<string, string> } } } }

describe('comped card model', () => {
  it('no expiry when comped_until is null', () => {
    const m = buildCompedCardModel({ compedUntil: null, feePercent: 0, locale: 'en', now: NOW })
    expect(m).toEqual({ hasExpiry: false, untilLabel: null, expired: false, feeLabel: '0' })
  })
  it('formats a future date per locale and is not expired', () => {
    const m = buildCompedCardModel({ compedUntil: '2026-12-31T00:00:00Z', feePercent: 5, locale: 'es', now: NOW })
    expect(m.hasExpiry).toBe(true)
    expect(m.expired).toBe(false)
    expect(m.untilLabel).toMatch(/31/)
    expect(m.untilLabel).toMatch(/dic/i)
  })
  it('flags a past date as expired', () => {
    const m = buildCompedCardModel({ compedUntil: '2026-01-01T00:00:00Z', feePercent: 0, locale: 'en', now: NOW })
    expect(m.expired).toBe(true)
    expect(m.untilLabel).toMatch(/Jan 1, 2026/)
  })
  it('ignores an unparseable date', () => {
    expect(buildCompedCardModel({ compedUntil: 'nope', feePercent: 0, locale: 'en' }).hasExpiry).toBe(false)
  })
  it('formats fee', () => {
    expect(formatFeePercent(0)).toBe('0')
    expect(formatFeePercent(12.5)).toBe('12.5')
    expect(formatFeePercent('12.50')).toBe('12.5')
    expect(formatFeePercent(null)).toBe('0')
    expect(formatFeePercent(150)).toBe('100')
  })
  it('en/es have the same comped keys', () => {
    const e = (en as unknown as Cat).dashboard.admin.billing.comped
    const s = (es as unknown as Cat).dashboard.admin.billing.comped
    expect(Object.keys(s).sort()).toEqual(Object.keys(e).sort())
  })
})
