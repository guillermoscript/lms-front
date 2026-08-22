/**
 * TTL rules for `platform_payment_requests` (issue #546 §2).
 *
 * A manual bank-transfer request is an open promise to pay. Until #546 nothing
 * ever closed one: the only terminal writers were the super-admin confirm and
 * reject actions, and `expire-platform-subscriptions` paused the downgrade for
 * as long as a renewal request sat in any pending state. Requesting a renewal
 * and never paying therefore kept the paid plan — its course/student limits and
 * its reduced transaction fee — forever.
 *
 * Every request now carries `expires_at` (created + TTL). Four call sites read
 * these rules and must agree, which is why they live here:
 *   - the two duplicate-request guards in `app/actions/admin/billing.ts`
 *   - the downgrade pause in `app/api/cron/expire-platform-subscriptions`
 *   - the sweep in that same cron that flips lapsed rows to `expired`
 *   - the Solana platform checkout (#610), whose pending intent IS one of these
 *     rows — a school must not be able to open a second one by starting a
 *     crypto payment on top of a bank transfer it has already requested
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Statuses that block a second request and pause entitlement downgrade. */
export const OPEN_REQUEST_STATUSES = ['pending', 'instructions_sent', 'payment_received'] as const

/** Only unpaid promises may be swept by the request TTL. */
export const EXPIRABLE_REQUEST_STATUSES = ['pending', 'instructions_sent'] as const

/**
 * Days a request stays open before the cron expires it. Mirrors the
 * `expires_at` column default in migration 20260726130000; changing one without
 * the other only shifts which side wins for freshly inserted rows, never
 * whether a request can hang forever.
 */
export const REQUEST_TTL_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

/** The `expires_at` an inserted request should carry, as an ISO string. */
export function requestExpiresAt(now: Date = new Date()): string {
  return new Date(now.getTime() + REQUEST_TTL_DAYS * DAY_MS).toISOString()
}

/**
 * Does this request still block a new one / still pause the downgrade?
 *
 * Note the deliberate asymmetry with the cron sweep: a row whose `expires_at`
 * has passed stops counting the instant it lapses, whether or not the cron has
 * run yet. Tying "does it still count" to the sweep would hand the outage
 * window back to the leak this TTL exists to close.
 */
export function isRequestOpen(
  request: { status: string; expires_at: string | null },
  now: Date = new Date()
): boolean {
  if (!(OPEN_REQUEST_STATUSES as readonly string[]).includes(request.status)) return false
  // Money has been observed. Expiring this row would turn a recoverable
  // activation failure back into money-without-service with no retry record.
  if (request.status === 'payment_received') return true
  // A NULL expiry predates the column (or was written by an older client);
  // treat it as open so a legitimate in-flight request is never dropped.
  if (!request.expires_at) return true
  return new Date(request.expires_at).getTime() > now.getTime()
}

/**
 * Is there an open (pending and not lapsed) platform payment request for this
 * tenant? One helper for every duplicate guard so a renewal can never be
 * created alongside a pending upgrade — the combination that used to disable
 * both guards permanently, because each returned `PGRST116 / data: null` from
 * `.single()` once two rows matched.
 */
export async function hasOpenPaymentRequest(
  admin: SupabaseClient,
  tenantId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('platform_payment_requests')
    .select('request_id, status, expires_at')
    .eq('tenant_id', tenantId)
    .in('status', OPEN_REQUEST_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(20)

  return ((data as { status: string; expires_at: string | null }[] | null) || []).some((r) =>
    isRequestOpen(r),
  )
}
