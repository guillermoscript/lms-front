import { describe, it, expect } from 'vitest'
import { validateBillingModeInput } from '@/lib/billing/billing-mode-input'

const NOW = new Date('2026-10-20T12:00:00Z')
const v = (raw: Record<string, unknown>) => validateBillingModeInput(raw, NOW)

describe('validateBillingModeInput', () => {
  it('rejects an unknown mode', () => {
    const r = v({ mode: 'free' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.mode).toBeDefined()
  })

  it('paid keeps the plan and clears everything else', () => {
    const r = v({ mode: 'paid', plan: 'pro', fee_percent_override: 5, reason: 'x' })
    expect(r).toEqual({
      ok: true,
      value: { mode: 'paid', plan: null, comped_until: null, fee_percent_override: null, reason: null },
    })
  })

  it('comped requires a reason and a valid plan', () => {
    const r = v({ mode: 'comped' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.reason).toBeDefined()
      expect(r.errors.plan).toBeDefined()
    }
    expect(v({ mode: 'comped', plan: 'gold', reason: 'x' }).ok).toBe(false)
  })

  it('comped fee defaults to 0 when blank or missing', () => {
    for (const fee of [undefined, null, '', '  ']) {
      const r = v({ mode: 'comped', plan: 'pro', reason: 'friend', fee_percent_override: fee })
      expect(r.ok && r.value.fee_percent_override).toBe(0)
    }
  })

  it('comped fee must be 0..100 and numeric', () => {
    for (const fee of [-1, 100.5, 'abc', NaN]) {
      const r = v({ mode: 'comped', plan: 'pro', reason: 'x', fee_percent_override: fee })
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.errors.fee_percent_override).toBeDefined()
    }
    const ok = v({ mode: 'comped', plan: 'pro', reason: 'x', fee_percent_override: '12.5' })
    expect(ok.ok && ok.value.fee_percent_override).toBe(12.5)
    expect(v({ mode: 'comped', plan: 'pro', reason: 'x', fee_percent_override: 100 }).ok).toBe(true)
  })

  it('rejects a past or present expiry, accepts null and future', () => {
    const base = { mode: 'comped', plan: 'pro', reason: 'x' }
    const past = v({ ...base, comped_until: '2026-10-19' })
    expect(past.ok).toBe(false)
    if (!past.ok) expect(past.errors.comped_until).toBeDefined()
    expect(v({ ...base, comped_until: 'nonsense' }).ok).toBe(false)
    const none = v({ ...base, comped_until: null })
    expect(none.ok && none.value.comped_until).toBeNull()
    const future = v({ ...base, comped_until: '2026-12-31' })
    expect(future.ok && future.value.comped_until).toBe('2026-12-31T23:59:59.000Z')
  })

  it('a bare date today is still in the future (end of day)', () => {
    const r = v({ mode: 'comped', plan: 'pro', reason: 'x', comped_until: '2026-10-20' })
    expect(r.ok).toBe(true)
  })

  it('internal forces enterprise, no fee, no expiry, and needs a reason', () => {
    expect(v({ mode: 'internal' }).ok).toBe(false)
    const r = v({ mode: 'internal', plan: 'free', fee_percent_override: 9, comped_until: '2030-01-01', reason: ' dogfood ' })
    expect(r).toEqual({
      ok: true,
      value: { mode: 'internal', plan: 'enterprise', comped_until: null, fee_percent_override: null, reason: 'dogfood' },
    })
  })

  it('caps reason length', () => {
    expect(v({ mode: 'internal', reason: 'a'.repeat(501) }).ok).toBe(false)
  })
})
