/**
 * TTL rules for student-facing `payment_requests` (issue #802).
 *
 * The school-facing twin of these rules has existed since #546
 * (`lib/billing/payment-request-ttl.ts`); the student side never got them. The
 * consequence was narrower than the billing leak but more annoying: the partial
 * unique indexes from #754 allow exactly one open request per student per item,
 * so a student who opened a request and never paid — or whose school never
 * worked the queue — was locked out of ever requesting that item again, with no
 * way back except an admin noticing and cancelling by hand.
 *
 * Three call sites read these rules and must agree, which is why they live here:
 *   - the duplicate guard in `insertPaymentRequest` (which also expires lazily,
 *     so a lapsed row never outlives the student's next attempt)
 *   - the reminder and sweep phases of `/api/cron/expire-payment-requests`
 *   - the admin queue, which labels a lapsed row before the cron has run
 */

/** Statuses in which a request is still being worked (mirrors the partial unique indexes). */
export const OPEN_MANUAL_REQUEST_STATUSES = ['pending', 'contacted', 'payment_received'] as const

/** Only unpaid promises may be swept. `payment_received` means an admin has already seen the money. */
export const EXPIRABLE_MANUAL_REQUEST_STATUSES = ['pending', 'contacted'] as const

/**
 * Days a request stays open before the sweep closes it. Mirrors the `expires_at`
 * column default in migration 20260920140000; changing one without the other
 * only shifts which side wins for freshly inserted rows, never whether a request
 * can hang forever.
 */
export const MANUAL_REQUEST_TTL_DAYS = 14

/** How long before expiry the student gets their one reminder. */
export const MANUAL_REQUEST_REMINDER_LEAD_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** Shape both the cron and the actions read — deliberately the column names. */
export interface ManualRequestTtlRow {
  status: string
  expires_at: string | null
  payment_reported_at?: string | null
}

/** The `expires_at` an inserted request should carry, as an ISO string. */
export function manualRequestExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + MANUAL_REQUEST_TTL_DAYS * DAY_MS).toISOString()
}

/** When this request's single reminder becomes due. */
export function manualReminderDueAt(expiresAt: string): Date {
  return new Date(new Date(expiresAt).getTime() - MANUAL_REQUEST_REMINDER_LEAD_DAYS * DAY_MS)
}

/**
 * Does this request still block a new one for the same item?
 *
 * Note the deliberate asymmetry with the sweep: a row whose `expires_at` has
 * passed stops counting the instant it lapses, whether or not the cron has run.
 * Tying "does it still count" to the sweep would hand the student's lockout back
 * for the length of any cron outage — the exact failure this closes.
 */
export function isManualRequestOpen(row: ManualRequestTtlRow, now: Date = new Date()): boolean {
  if (!(OPEN_MANUAL_REQUEST_STATUSES as readonly string[]).includes(row.status)) return false
  // An admin has confirmed receipt. Expiring this would turn a half-finished
  // enrollment into money-without-service with no record to retry from.
  if (row.status === 'payment_received') return true
  // The student says they have paid. The claim may be wrong, but it is the
  // admin's to reject — a sweep must never cancel a request with money against
  // it, or the student loses both the transfer and the queue position.
  if (row.payment_reported_at) return true
  // A NULL expiry predates the column; treat it as open so a legitimate
  // in-flight request is never dropped.
  if (!row.expires_at) return true
  return new Date(row.expires_at).getTime() > now.getTime()
}

/** Is this row the sweep's business: unpaid, unreported and past its expiry? */
export function isManualRequestExpirable(row: ManualRequestTtlRow, now: Date = new Date()): boolean {
  if (!(EXPIRABLE_MANUAL_REQUEST_STATUSES as readonly string[]).includes(row.status)) return false
  if (row.payment_reported_at) return false
  if (!row.expires_at) return false
  return new Date(row.expires_at).getTime() <= now.getTime()
}
