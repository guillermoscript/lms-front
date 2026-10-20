/**
 * Pure view-model for the school-admin "complimentary plan" card.
 * Design: docs/INTERNAL_COMPED_SCHOOLS.md ("Tenant-facing transparency").
 */
export interface CompedCardModel {
  /** `comped_until` has a value (even if already past). */
  hasExpiry: boolean
  /** Formatted date, or null when there is no expiry. */
  untilLabel: string | null
  /** Expiry is in the past (the cron has not flipped the school yet). */
  expired: boolean
  /** Fee as shown to the user: "0", "12.5", "20". Never "12.50". */
  feeLabel: string
}

export function formatFeePercent(fee: number | string | null | undefined): string {
  const n = fee == null ? 0 : Number(fee)
  if (!Number.isFinite(n)) return '0'
  const clamped = Math.min(100, Math.max(0, n))
  return String(Math.round(clamped * 100) / 100)
}

export function buildCompedCardModel(input: {
  compedUntil: string | null | undefined
  feePercent: number | string | null | undefined
  locale: string
  now?: Date
}): CompedCardModel {
  const feeLabel = formatFeePercent(input.feePercent)
  const until = input.compedUntil ? new Date(input.compedUntil) : null
  if (!until || Number.isNaN(until.getTime())) {
    return { hasExpiry: false, untilLabel: null, expired: false, feeLabel }
  }
  // UTC so the day does not shift with the viewer's timezone (stored as timestamptz midnight).
  const untilLabel = new Intl.DateTimeFormat(input.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(until)
  return {
    hasExpiry: true,
    untilLabel,
    expired: until.getTime() < (input.now ?? new Date()).getTime(),
    feeLabel,
  }
}
