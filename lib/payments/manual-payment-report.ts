/**
 * Validation for what a student reports after paying offline (issue #802).
 *
 * Kept out of the server action so the rules are unit-testable and so the same
 * normalisation runs whether the report arrives from the student's form or from
 * an admin filling it in on their behalf (a phone call is still how a lot of
 * this gets settled).
 *
 * Everything here is a *claim*. None of it decides what the student owes —
 * `payment_amount` stays derived from the product server-side — so the job is
 * to make the claim legible and comparable, not to trust it.
 */

export interface ManualPaymentReportInput {
  reference: string
  paidAt?: string | null
  paidToAccount?: string | null
  amount?: number | string | null
  currency?: string | null
  payerName?: string | null
  payerDocument?: string | null
  payerBank?: string | null
  payerPhone?: string | null
}

export interface NormalizedManualPaymentReport {
  payment_reference: string
  paid_at: string | null
  paid_to_account: string | null
  reported_amount: number | null
  reported_currency: string | null
  payer_name: string | null
  payer_document: string | null
  payer_bank: string | null
  payer_phone: string | null
}

/** Longest any single free-text field may be — enough for a bank name, not an essay. */
const MAX_FIELD = 120

/** A reference below this is almost certainly a mistyped fragment. */
const MIN_REFERENCE = 3

/** Tolerance for a client clock running ahead of ours. */
const FUTURE_SLACK_MS = 24 * 60 * 60 * 1000

/** Nothing older than this is a plausible payment for a live request. */
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export class ManualPaymentReportError extends Error {}

function text(value: string | null | undefined, field: string): string | null {
  const trimmed = (value ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return null
  if (trimmed.length > MAX_FIELD) {
    throw new ManualPaymentReportError(`${field} is too long (max ${MAX_FIELD} characters)`)
  }
  return trimmed
}

/**
 * Normalise a report or explain why it cannot be accepted.
 *
 * Throws `ManualPaymentReportError` with a message meant for the student — the
 * caller returns it as `{ error }` rather than throwing, because Next replaces a
 * thrown Server Action message with a generic digest in production builds.
 */
export function normalizeManualPaymentReport(
  input: ManualPaymentReportInput,
  now: Date = new Date(),
): NormalizedManualPaymentReport {
  // The reference is the whole point: it is what ties this row to a line on the
  // school's bank statement. Everything else is optional colour.
  const reference = text(input.reference, 'Reference')
  if (!reference || reference.length < MIN_REFERENCE) {
    throw new ManualPaymentReportError('Enter the reference or confirmation number of your payment')
  }

  let paidAt: string | null = null
  if (input.paidAt) {
    const parsed = new Date(input.paidAt)
    if (Number.isNaN(parsed.getTime())) {
      throw new ManualPaymentReportError('The payment date is not a valid date')
    }
    if (parsed.getTime() > now.getTime() + FUTURE_SLACK_MS) {
      throw new ManualPaymentReportError('The payment date cannot be in the future')
    }
    if (parsed.getTime() < now.getTime() - MAX_AGE_MS) {
      throw new ManualPaymentReportError('The payment date is too far in the past')
    }
    paidAt = parsed.toISOString()
  }

  let reportedAmount: number | null = null
  if (input.amount !== null && input.amount !== undefined && `${input.amount}`.trim() !== '') {
    // Accept a comma decimal separator: a Venezuelan or Spanish keyboard types
    // `12,50` and rejecting it would read as the form being broken.
    const parsed = Number.parseFloat(`${input.amount}`.trim().replace(',', '.'))
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new ManualPaymentReportError('The amount you paid must be a number greater than zero')
    }
    reportedAmount = Math.round(parsed * 100) / 100
  }

  let reportedCurrency: string | null = null
  if (input.currency) {
    const code = input.currency.trim().toUpperCase()
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new ManualPaymentReportError('Currency must be a three-letter code, such as USD or VES')
    }
    reportedCurrency = code
  }

  return {
    payment_reference: reference,
    paid_at: paidAt,
    paid_to_account: text(input.paidToAccount, 'Account'),
    reported_amount: reportedAmount,
    reported_currency: reportedCurrency,
    payer_name: text(input.payerName, 'Payer name'),
    payer_document: text(input.payerDocument, 'ID number'),
    payer_bank: text(input.payerBank, 'Bank'),
    payer_phone: text(input.payerPhone, 'Phone'),
  }
}
