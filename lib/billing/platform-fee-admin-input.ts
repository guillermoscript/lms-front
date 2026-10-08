/**
 * Input validation for the super-admin platform fee actions (#929, step 7).
 * Pure: shared by the server actions (authoritative, before the RPC) and unit
 * tests. The SQL functions re-check every rule; this only turns a bad form
 * into a typed error code instead of a raw database message.
 */

export const FEE_REASON_MIN = 3
export const FEE_REASON_MAX = 500
export const FEE_REFERENCE_MAX = 255

export type FeeAdminInputError = 'invalid_amount' | 'invalid_currency' | 'reason_required' | 'invalid_kind' | 'invalid_id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v)
}

export function parseFeeReason(raw: unknown): { ok: true; value: string } | { ok: false; error: 'reason_required' } {
  const value = typeof raw === 'string' ? raw.trim() : ''
  if (value.length < FEE_REASON_MIN) return { ok: false, error: 'reason_required' }
  return { ok: true, value: value.slice(0, FEE_REASON_MAX) }
}

export interface ParsedFeePaymentInput {
  tenantId: string
  currency: string
  amount: number
  kind: 'offline' | 'waiver'
  reason: string
  reference: string | null
}

/** Offline payment or waiver: positive amount with at most 2 decimals, ISO currency, a reason. */
export function parseFeePaymentInput(raw: {
  tenantId: unknown
  currency: unknown
  amount: unknown
  kind: unknown
  reason: unknown
  reference?: unknown
}): { ok: true; value: ParsedFeePaymentInput } | { ok: false; error: FeeAdminInputError } {
  if (!isUuid(raw.tenantId)) return { ok: false, error: 'invalid_id' }
  if (raw.kind !== 'offline' && raw.kind !== 'waiver') return { ok: false, error: 'invalid_kind' }

  const currency = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : ''
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, error: 'invalid_currency' }

  const text = typeof raw.amount === 'number' ? String(raw.amount) : typeof raw.amount === 'string' ? raw.amount.trim().replace(',', '.') : ''
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, error: 'invalid_amount' }
  const amount = Number(text)
  if (!(amount > 0) || amount >= 1e8) return { ok: false, error: 'invalid_amount' }

  const reason = parseFeeReason(raw.reason)
  if (!reason.ok) return reason

  const reference =
    typeof raw.reference === 'string' && raw.reference.trim() ? raw.reference.trim().slice(0, FEE_REFERENCE_MAX) : null

  return { ok: true, value: { tenantId: raw.tenantId, currency, amount, kind: raw.kind, reason: reason.value, reference } }
}
