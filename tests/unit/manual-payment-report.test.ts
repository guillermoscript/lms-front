import { describe, it, expect } from 'vitest'
import {
  normalizeManualPaymentReport,
  ManualPaymentReportError,
  type ManualPaymentReportInput,
} from '@/lib/payments/manual-payment-report'

/**
 * Validation/normalisation of what a student reports after paying offline
 * (issue #802). Everything here is a *claim* — `payment_amount` stays derived
 * from the product server-side, so these tests check legibility, not trust.
 */

const NOW = new Date('2026-09-20T12:00:00.000Z')

function input(over: Partial<ManualPaymentReportInput> = {}): ManualPaymentReportInput {
  return { reference: 'REF-123456', ...over }
}

describe('reference', () => {
  it('rejects a missing reference', () => {
    expect(() => normalizeManualPaymentReport(input({ reference: undefined as unknown as string }), NOW)).toThrow(
      ManualPaymentReportError,
    )
  })

  it('rejects a blank reference', () => {
    expect(() => normalizeManualPaymentReport(input({ reference: '   ' }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('rejects a too-short reference', () => {
    expect(() => normalizeManualPaymentReport(input({ reference: 'ab' }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('accepts and trims/collapses whitespace in a valid reference', () => {
    const result = normalizeManualPaymentReport(input({ reference: '  REF   123   456  ' }), NOW)
    expect(result.payment_reference).toBe('REF 123 456')
  })

  it('rejects a reference over the 120-char cap', () => {
    expect(() => normalizeManualPaymentReport(input({ reference: 'a'.repeat(121) }), NOW)).toThrow(
      ManualPaymentReportError,
    )
  })

  it('accepts a reference at exactly the 120-char cap', () => {
    const result = normalizeManualPaymentReport(input({ reference: 'a'.repeat(120) }), NOW)
    expect(result.payment_reference).toHaveLength(120)
  })
})

describe('other free-text fields also enforce the 120-char cap', () => {
  it.each(['paidToAccount', 'payerName', 'payerDocument', 'payerBank', 'payerPhone'] as const)(
    'rejects %s over 120 characters',
    field => {
      expect(() => normalizeManualPaymentReport(input({ [field]: 'x'.repeat(121) }), NOW)).toThrow(
        ManualPaymentReportError,
      )
    },
  )
})

describe('amount', () => {
  it('accepts a comma decimal separator (Spanish/LATAM keyboard)', () => {
    const result = normalizeManualPaymentReport(input({ amount: '12,50' }), NOW)
    expect(result.reported_amount).toBe(12.5)
  })

  it('rejects zero', () => {
    expect(() => normalizeManualPaymentReport(input({ amount: 0 }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('rejects a negative amount', () => {
    expect(() => normalizeManualPaymentReport(input({ amount: -5 }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('rejects a non-numeric amount', () => {
    expect(() => normalizeManualPaymentReport(input({ amount: 'not-a-number' }), NOW)).toThrow(
      ManualPaymentReportError,
    )
  })

  it('rounds to 2 decimals', () => {
    const result = normalizeManualPaymentReport(input({ amount: '12.3456' }), NOW)
    expect(result.reported_amount).toBe(12.35)
  })

  it('is null when omitted', () => {
    const result = normalizeManualPaymentReport(input({ amount: null }), NOW)
    expect(result.reported_amount).toBeNull()
  })

  it('is null when an empty string', () => {
    const result = normalizeManualPaymentReport(input({ amount: '   ' }), NOW)
    expect(result.reported_amount).toBeNull()
  })
})

describe('currency', () => {
  it('uppercases usd to USD', () => {
    const result = normalizeManualPaymentReport(input({ currency: 'usd' }), NOW)
    expect(result.reported_currency).toBe('USD')
  })

  it.each(['US', 'USDD', 'U5D', '123'])('rejects %s — not exactly three letters', bad => {
    expect(() => normalizeManualPaymentReport(input({ currency: bad }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('is null when omitted', () => {
    const result = normalizeManualPaymentReport(input({}), NOW)
    expect(result.reported_currency).toBeNull()
  })
})

describe('paidAt', () => {
  it('rejects an invalid date', () => {
    expect(() => normalizeManualPaymentReport(input({ paidAt: 'not-a-date' }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('rejects a date more than 24h in the future', () => {
    const tooFar = new Date(NOW.getTime() + 25 * 60 * 60 * 1000).toISOString()
    expect(() => normalizeManualPaymentReport(input({ paidAt: tooFar }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('accepts a date slightly in the future (clock skew)', () => {
    const slightlyAhead = new Date(NOW.getTime() + 2 * 60 * 60 * 1000).toISOString()
    const result = normalizeManualPaymentReport(input({ paidAt: slightlyAhead }), NOW)
    expect(result.paid_at).toBe(new Date(slightlyAhead).toISOString())
  })

  it('rejects a date older than a year', () => {
    const tooOld = new Date(NOW.getTime() - 366 * 24 * 60 * 60 * 1000).toISOString()
    expect(() => normalizeManualPaymentReport(input({ paidAt: tooOld }), NOW)).toThrow(ManualPaymentReportError)
  })

  it('returns an ISO string for a valid date', () => {
    const result = normalizeManualPaymentReport(input({ paidAt: '2026-09-15T08:30:00.000Z' }), NOW)
    expect(result.paid_at).toBe('2026-09-15T08:30:00.000Z')
  })

  it('is null when omitted', () => {
    const result = normalizeManualPaymentReport(input({}), NOW)
    expect(result.paid_at).toBeNull()
  })
})

describe('empty optional fields come back as null, never empty string', () => {
  it('blank strings across every optional field normalise to null', () => {
    const result = normalizeManualPaymentReport(
      input({
        paidToAccount: '',
        payerName: '   ',
        payerDocument: '',
        payerBank: '',
        payerPhone: '',
        currency: '',
        amount: '',
      }),
      NOW,
    )
    expect(result.paid_to_account).toBeNull()
    expect(result.payer_name).toBeNull()
    expect(result.payer_document).toBeNull()
    expect(result.payer_bank).toBeNull()
    expect(result.payer_phone).toBeNull()
    expect(result.reported_currency).toBeNull()
    expect(result.reported_amount).toBeNull()
  })
})

describe('errors', () => {
  it('are ManualPaymentReportError with a student-readable message', () => {
    try {
      normalizeManualPaymentReport(input({ reference: '' }), NOW)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ManualPaymentReportError)
      expect((err as Error).message).toMatch(/reference/i)
    }
  })
})
