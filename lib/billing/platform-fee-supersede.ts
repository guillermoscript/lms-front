/**
 * One open hosted fee checkout per tenant + rail (#951).
 *
 * `POST /api/billing/fees/checkout` writes a `pending` `platform_fee_payments`
 * row per attempt. The manual and Solana rails are guarded by their request
 * row (`hasOpenPaymentRequest`); the hosted rails (Stripe, PayPal, Binance Pay)
 * had no guard, so every retry left another pending row and nobody could tell
 * an abandoned attempt from one in flight. A new attempt on a rail now
 * SUPERSEDES the previous open one on that same rail.
 *
 * The order is the whole point. `settle_platform_fee_payment()` only credits a
 * `pending` row: a provider success landing on a cancelled one is flagged
 * (`review_reason`) and NOT credited. So a row is cancelled only AFTER its
 * checkout is closed at the provider (`closeFeeCheckoutAtProvider`), and a row
 * is never reused: each one maps to exactly one provider checkout with an
 * immutable amount.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  closeFeeCheckoutAtProvider,
  type FeeCheckoutCloseOutcome,
  type FeeCheckoutRow,
} from '@/lib/billing/platform-fee-checkout-close'

/**
 * A pending row with no provider reference yet is, for a moment, another
 * request (a double submit) between its insert and its checkout call.
 * Cancelling it would orphan the checkout that request is about to hand the
 * payer. Same window as `OBJECTLESS_GRACE_MS` in `lib/payments/stripe-reconcile.ts`.
 */
export const FEE_CHECKOUT_OPENING_GRACE_MS = 2 * 60_000

/** Normally 0 or 1 open row per rail; anything past the cap is the stale sweep's job. */
export const SUPERSEDE_SCAN_LIMIT = 20

/**
 * - `checkout_opening`: another request is still opening a checkout on this rail.
 * - `payment_in_progress`: the previous checkout took money or is taking it.
 * - `provider_unknown`: the rail did not answer, and it is the one about to be called.
 * - `lookup_failed`: the ledger could not be read or written.
 */
export type SupersedeRefusal = 'checkout_opening' | 'payment_in_progress' | 'provider_unknown' | 'lookup_failed'

export type SupersedeResult =
  | { ok: true; superseded: string[] }
  | { ok: false; reason: SupersedeRefusal; paymentId: string | null; superseded: string[] }

export interface SupersedeDeps {
  close?: (admin: SupabaseClient, row: FeeCheckoutRow) => Promise<FeeCheckoutCloseOutcome>
  now?: () => number
}

interface OpenFeeRow extends FeeCheckoutRow {
  created_at: string
}

/**
 * Close and cancel every open hosted attempt of this tenant on this rail so the
 * caller can insert a fresh one. Run it BEFORE the new row is written: every
 * refusal here must leave the ledger without a new pending row.
 *
 * Open = `pending`, no `review_reason` (a mismatched payment already arrived
 * on such a row; a super admin resolves it, so it neither blocks nor is
 * cancelled) and not the money row of a `platform_payment_requests` row (that
 * one lives and dies with its request). Other rails are left to the stale sweep.
 */
export async function supersedeOpenFeeCheckouts(
  admin: SupabaseClient,
  input: { tenantId: string; provider: string },
  deps: SupersedeDeps = {},
): Promise<SupersedeResult> {
  const close = deps.close ?? closeFeeCheckoutAtProvider
  const now = deps.now ?? Date.now
  const superseded: string[] = []
  const refuse = (reason: SupersedeRefusal, paymentId: string | null = null): SupersedeResult => ({
    ok: false,
    reason,
    paymentId,
    superseded,
  })

  const { data: pending, error: pendingError } = await admin
    .from('platform_fee_payments')
    .select('payment_id, tenant_id, provider, provider_reference, amount, currency, created_at')
    .eq('tenant_id', input.tenantId)
    .eq('provider', input.provider)
    .eq('status', 'pending')
    .is('review_reason', null)
    .order('created_at', { ascending: true })
    .limit(SUPERSEDE_SCAN_LIMIT)
  if (pendingError) {
    console.error('[platform-fee-supersede] pending lookup failed:', pendingError.code, pendingError.message)
    return refuse('lookup_failed')
  }
  let open = (pending as OpenFeeRow[] | null) ?? []
  if (open.length === 0) return { ok: true, superseded }

  const { data: requests, error: requestsError } = await admin
    .from('platform_payment_requests')
    .select('fee_payment_id')
    .eq('tenant_id', input.tenantId)
    .in(
      'fee_payment_id',
      open.map((r) => r.payment_id),
    )
  if (requestsError) {
    console.error('[platform-fee-supersede] request lookup failed:', requestsError.code, requestsError.message)
    return refuse('lookup_failed')
  }
  const requestOwned = new Set(
    ((requests as { fee_payment_id: string | null }[] | null) ?? []).map((r) => r.fee_payment_id),
  )
  open = open.filter((r) => !requestOwned.has(r.payment_id))

  // Checked for every row before anything is closed: a double submit must
  // write nothing at all.
  const opening = open.find(
    (r) => !r.provider_reference && now() - Date.parse(r.created_at) < FEE_CHECKOUT_OPENING_GRACE_MS,
  )
  if (opening) return refuse('checkout_opening', opening.payment_id)

  for (const row of open) {
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
        `[platform-fee-supersede] close threw for ${row.payment_id}:`,
        err instanceof Error ? err.message : err,
      )
      outcome = 'unknown'
    }

    if (outcome === 'paid') return refuse('payment_in_progress', row.payment_id)
    if (outcome === 'unknown') return refuse('provider_unknown', row.payment_id)

    // `closed`, or `unsupported`: a late success on a rail that cannot be
    // asked is flagged for review by the settle function, never lost.
    const { error: cancelError } = await admin
      .from('platform_fee_payments')
      .update({ status: 'canceled', updated_at: new Date(now()).toISOString() })
      .eq('payment_id', row.payment_id)
      .eq('status', 'pending')
    if (cancelError) {
      console.error('[platform-fee-supersede] cancel failed:', cancelError.code, cancelError.message)
      return refuse('lookup_failed', row.payment_id)
    }
    superseded.push(row.payment_id)
  }

  return { ok: true, superseded }
}
