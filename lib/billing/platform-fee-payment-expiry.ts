/**
 * Stale platform-fee pay-now payments (#951): TTL rules and the sweep that
 * `/api/cron/expire-stale-checkouts` runs as its second phase.
 *
 * `POST /api/billing/fees/checkout` writes a `pending` `platform_fee_payments`
 * row before it sends the school to the provider. `after_fee_request_closed`
 * cancels that row when its `platform_payment_requests` row is rejected or
 * expires, but only the manual and Solana rails create a request: a hosted
 * checkout (Stripe, PayPal, Binance Pay) the school walked away from stayed
 * `pending` forever.
 *
 * CLOSE BEFORE CANCELLING. `settle_platform_fee_payment()` only credits a
 * `pending` row, so a provider success landing on a cancelled one is flagged
 * for review instead of credited. A lapsed TTL means "we stopped hearing about
 * it", not "it was not paid": every row is closed at its provider first
 * (`closeFeeCheckoutAtProvider`) and only one that can no longer take money is
 * cancelled.
 *
 * DATA-DRIVEN, never a provider list: what protects a row is that a
 * `platform_payment_requests` row points at it, in ANY status. That request's
 * own lifecycle then decides (which is what keeps a `payment_received` request
 * safe from this TTL), and an orphan manual / Solana row whose request insert
 * failed is swept like any other.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkoutTtlMinutes } from '@/lib/payments/checkout-expiry'
import {
  closeFeeCheckoutAtProvider,
  type FeeCheckoutCloseOutcome,
  type FeeCheckoutRow,
} from '@/lib/billing/platform-fee-checkout-close'

/** Cap the provider calls of one pass so a backlog cannot time the request out; the next tick continues. */
export const FEE_PAYMENT_EXPIRY_BATCH_LIMIT = 200

/**
 * Rows read per page, and how many pages one pass may read looking for rows to
 * act on. Request-owned rows are not an exception to page past: every open
 * manual fee request older than the TTL is one, for up to its own 14 days, and
 * a single unpaged read of the oldest rows would be filled by them. The page
 * size is also the `.in()` list of the request lookup, kept inside the URL
 * budget documented in `lib/supabase/fetch-all-rows-in.ts`.
 */
const SCAN_PAGE_SIZE = 200
const MAX_SCAN_PAGES = 10

/**
 * Per-rail TTL override, in minutes, for a rail whose checkout needs a
 * different window than `checkoutTtlMinutes()`.
 *
 * Empty on purpose: no rail has shown it needs another window. Stripe and
 * PayPal are closed at the provider before their row is cancelled, so the TTL
 * only decides WHEN that happens. A rail that cannot be closed first (Binance
 * Pay) is the one this map exists for: if late successes ever show up flagged
 * on its cancelled rows, lengthen it here. Erring long is the safe direction
 * (see `DEFAULT_CHECKOUT_TTL_MINUTES`); a shorter window needs the reason it
 * cannot cancel a checkout the payer is still completing.
 */
export const FEE_PAYMENT_TTL_MINUTES: Partial<Record<string, number>> = {}

/** The TTL of a fee payment on this rail, in minutes. */
export function feePaymentTtlMinutes(provider: string): number {
  const override = FEE_PAYMENT_TTL_MINUTES[provider]
  return typeof override === 'number' && Number.isFinite(override) && override > 0
    ? override
    : checkoutTtlMinutes()
}

/** Has this pending row outlived its rail's TTL? */
export function isFeePaymentStale(
  row: { provider: string; created_at: string },
  now: Date = new Date(),
): boolean {
  return now.getTime() - Date.parse(row.created_at) > feePaymentTtlMinutes(row.provider) * 60_000
}

/** The shortest TTL any rail can have: the DB filter must not hide a row a per-rail window would include. */
function shortestTtlMinutes(): number {
  const overrides = Object.keys(FEE_PAYMENT_TTL_MINUTES).map(feePaymentTtlMinutes)
  return Math.min(checkoutTtlMinutes(), ...overrides)
}

export interface FeePaymentExpiryResult {
  /** Stale pending rows read this pass. */
  scanned: number
  /** The money row of a `platform_payment_requests` row: that request's lifecycle decides, not this TTL. */
  skipped: number
  /** Paid, or being paid, at the provider: never cancelled. Credited in place where the rail allows, else by its webhook. */
  recovered: number
  /** Left pending for the next pass: the provider did not answer, or the cancel could not be written. */
  waiting: number
  /** What the DB actually cancelled — not what this pass selected. */
  expired: number
}

export interface FeePaymentExpiryDeps {
  close?: (admin: SupabaseClient, row: FeeCheckoutRow) => Promise<FeeCheckoutCloseOutcome>
}

interface StaleFeePayment extends FeeCheckoutRow {
  created_at: string
}

/** Which of these payments a `platform_payment_requests` row points at, whatever its status. */
async function requestOwnedPaymentIds(admin: SupabaseClient, paymentIds: string[]): Promise<Set<string>> {
  if (paymentIds.length === 0) return new Set()
  const { data, error } = await admin
    .from('platform_payment_requests')
    .select('fee_payment_id')
    .in('fee_payment_id', paymentIds)
  // Fail closed: without this answer a `payment_received` request could be swept.
  if (error) throw new Error(`platform_payment_requests lookup failed: ${error.message}`)
  return new Set(
    ((data as { fee_payment_id: string | null }[] | null) ?? [])
      .map((r) => r.fee_payment_id)
      .filter((id): id is string => !!id),
  )
}

/**
 * Close and cancel every pending fee payment that outlived its TTL and that no
 * payment request owns. Idempotent: a repeated or overlapping run finds the
 * checkout already closed and the row already cancelled.
 *
 * Skipped outright: a row with `review_reason` set. A payment that did not
 * match it has already arrived; a super admin resolves that, and the school's
 * balance card counts it until they do.
 *
 * @throws when the ledger cannot be read. Nothing was closed or cancelled then.
 */
export async function expireStaleFeePayments(
  admin: SupabaseClient,
  now: Date = new Date(),
  deps: FeePaymentExpiryDeps = {},
): Promise<FeePaymentExpiryResult> {
  const close = deps.close ?? closeFeeCheckoutAtProvider
  const result: FeePaymentExpiryResult = { scanned: 0, skipped: 0, recovered: 0, waiting: 0, expired: 0 }
  const cutoff = new Date(now.getTime() - shortestTtlMinutes() * 60_000).toISOString()

  // Read first, act after: nothing below changes a row while the pages are
  // still being walked, so the offsets stay true.
  const candidates: StaleFeePayment[] = []
  for (let page = 0; page < MAX_SCAN_PAGES && candidates.length < FEE_PAYMENT_EXPIRY_BATCH_LIMIT; page++) {
    const from = page * SCAN_PAGE_SIZE
    const { data, error } = await admin
      .from('platform_fee_payments')
      .select('payment_id, tenant_id, provider, provider_reference, amount, currency, created_at')
      .eq('status', 'pending')
      .is('review_reason', null)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .order('payment_id', { ascending: true })
      .range(from, from + SCAN_PAGE_SIZE - 1)
    if (error) throw new Error(`platform_fee_payments stale read failed: ${error.message}`)

    const rows = ((data as StaleFeePayment[] | null) ?? []).filter((row) => isFeePaymentStale(row, now))
    result.scanned += rows.length

    const owned = await requestOwnedPaymentIds(
      admin,
      rows.map((row) => row.payment_id),
    )
    for (const row of rows) {
      if (owned.has(row.payment_id)) result.skipped++
      else if (candidates.length < FEE_PAYMENT_EXPIRY_BATCH_LIMIT) candidates.push(row)
    }

    if ((data?.length ?? 0) < SCAN_PAGE_SIZE) break
  }

  const canceledAt = now.toISOString()
  for (const row of candidates) {
    let outcome: FeeCheckoutCloseOutcome
    try {
      outcome = await close(admin, {
        payment_id: row.payment_id,
        tenant_id: row.tenant_id,
        provider: row.provider,
        provider_reference: row.provider_reference,
        amount: Number(row.amount),
        currency: row.currency,
      })
    } catch (err) {
      // Not an answer, so not an abandonment.
      console.error(
        `[platform-fee-expiry] close threw for ${row.payment_id}:`,
        err instanceof Error ? err.message : err,
      )
      outcome = 'unknown'
    }

    if (outcome === 'paid') {
      result.recovered++
      continue
    }
    if (outcome === 'unknown') {
      result.waiting++
      continue
    }

    // `closed`, or `unsupported`: a rail that cannot be asked gets no better
    // answer by waiting, and a success that still arrives is flagged for review
    // by the settle function, never lost.
    //
    // 'canceled', NOT 'failed': nothing failed, nobody paid. Written per row,
    // right after its close, so a pass cut short keeps what it already did. The
    // `status = 'pending'` / `review_reason IS NULL` guards let a webhook that
    // settled or flagged the row since the read above win.
    const { data: updated, error: cancelError } = await admin
      .from('platform_fee_payments')
      .update({ status: 'canceled', updated_at: canceledAt })
      .eq('payment_id', row.payment_id)
      .eq('status', 'pending')
      .is('review_reason', null)
      .select('payment_id')
    if (cancelError) {
      console.error(
        `[platform-fee-expiry] cancel failed for ${row.payment_id}:`,
        cancelError.code,
        cancelError.message,
      )
      result.waiting++
      continue
    }
    result.expired += updated?.length ?? 0
  }

  return result
}
