import { BILLING_MODES, isBillingMode, type BillingMode } from '@/lib/billing/billing-mode'

/**
 * Pure validation / normalisation for the super-admin "billing mode" change
 * (`setTenantBillingMode`). No I/O, so the rules are unit-testable and the dialog
 * can reuse them for inline errors.
 */

export const PLAN_SLUGS = ['free', 'starter', 'pro', 'business', 'enterprise'] as const
/** `internal` schools are pinned to the top plan. */
export const INTERNAL_PLAN_SLUG = 'enterprise'
export const REASON_MAX_LENGTH = 500

export interface BillingModeInputRaw {
  mode?: unknown
  plan?: unknown
  comped_until?: unknown
  fee_percent_override?: unknown
  reason?: unknown
}

export interface BillingModeInput {
  mode: BillingMode
  /** null = keep the tenant's current plan (paid only). */
  plan: string | null
  /** ISO timestamp, comped only. */
  comped_until: string | null
  /** comped: 0..100 (default 0). paid / internal: null. */
  fee_percent_override: number | null
  /** null for paid. */
  reason: string | null
}

export type BillingModeField = 'mode' | 'plan' | 'comped_until' | 'fee_percent_override' | 'reason'

export type BillingModeValidation =
  | { ok: true; value: BillingModeInput }
  | { ok: false; errors: Partial<Record<BillingModeField, string>> }

function parseUntil(raw: unknown, now: Date): { value: string | null; error?: string } {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: null }
  }
  if (typeof raw !== 'string' && !(raw instanceof Date)) return { value: null, error: 'Enter a valid date' }
  let date: Date
  if (raw instanceof Date) {
    date = raw
  } else {
    const s = raw.trim()
    // A bare date (from <input type="date">) means "through the end of that day" (UTC).
    date = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T23:59:59.000Z`) : new Date(s)
  }
  if (Number.isNaN(date.getTime())) return { value: null, error: 'Enter a valid date' }
  if (date.getTime() <= now.getTime()) return { value: null, error: 'Expiry must be in the future' }
  return { value: date.toISOString() }
}

function parseFee(raw: unknown): { value: number | null; error?: string } {
  // Required for comped, default 0: blank / missing means 0.
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
    return { value: 0 }
  }
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN
  if (!Number.isFinite(n)) return { value: null, error: 'Fee must be a number' }
  if (n < 0 || n > 100) return { value: null, error: 'Fee must be between 0 and 100' }
  return { value: Math.round(n * 100) / 100 }
}

export function validateBillingModeInput(raw: BillingModeInputRaw, now: Date = new Date()): BillingModeValidation {
  const errors: Partial<Record<BillingModeField, string>> = {}

  if (!isBillingMode(raw.mode)) {
    return { ok: false, errors: { mode: `Mode must be one of: ${BILLING_MODES.join(', ')}` } }
  }
  const mode = raw.mode

  if (mode === 'paid') {
    return { ok: true, value: { mode, plan: null, comped_until: null, fee_percent_override: null, reason: null } }
  }

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : ''
  if (!reason) errors.reason = 'A reason is required'
  else if (reason.length > REASON_MAX_LENGTH) errors.reason = `Reason must be at most ${REASON_MAX_LENGTH} characters`

  if (mode === 'internal') {
    if (Object.keys(errors).length) return { ok: false, errors }
    return {
      ok: true,
      value: { mode, plan: INTERNAL_PLAN_SLUG, comped_until: null, fee_percent_override: null, reason },
    }
  }

  // comped
  let plan: string | null = null
  if (typeof raw.plan !== 'string' || !(PLAN_SLUGS as readonly string[]).includes(raw.plan)) {
    errors.plan = 'Choose a plan'
  } else {
    plan = raw.plan
  }
  const until = parseUntil(raw.comped_until, now)
  if (until.error) errors.comped_until = until.error
  const fee = parseFee(raw.fee_percent_override)
  if (fee.error) errors.fee_percent_override = fee.error

  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: { mode, plan, comped_until: until.value, fee_percent_override: fee.value, reason },
  }
}
