/**
 * Shared binance_personal confirmation core (issue #482).
 *
 * Mirrors lib/payments/solana-reconcile.ts: the match-and-flip logic is needed
 * by both the browser poll (/api/payments/binance-personal/verify) and the
 * backstop cron (/api/cron/binance-personal-reconcile), and keeping it here
 * means the two can never drift.
 *
 * The authoritative source is the school's own Pay history
 * (GET /sapi/v1/pay/transactions, read-only key). Matching rules, in strict
 * priority order — NEVER guess:
 *
 *   1. The transfer note carries the payment code (= our transaction id) AND
 *      the amount covers the expected price → confirm.
 *   2. No note match: a transfer of the EXACT amount exists AND this is the
 *      ONLY pending binance_personal transaction for that amount in this
 *      tenant → confirm (no possible collision).
 *   3. Anything else (two pendings sharing an amount, no note) → `ambiguous`;
 *      the transaction stays pending and surfaces for one-click manual
 *      confirmation in the admin dashboard.
 *
 * Idempotency: the matched Binance orderId is CONSUMED via provider_charge_id
 * (partial unique index transactions_provider_charge_id_unique) so one
 * transfer can never confirm two orders; the status-guarded flip keeps
 * concurrent poll + cron runs from double-processing.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { BinancePayTransfer } from './binance-personal-provider'
import { BinancePersonalProvider } from './binance-personal-provider'
import { decryptCredential, getPaymentCredentialsKey } from './credentials'

/** The transaction columns the reconciler needs. */
export interface BinancePersonalTx {
  transaction_id: number | string
  amount: number
  tenant_id: string
  plan_id: number | string | null
  /** Row creation time — bounds the matching window. */
  transaction_date: string | null
}

export type BinanceReconcileResult =
  | { status: 'confirmed'; orderId?: string; alreadyProcessed?: boolean }
  | { status: 'not_found' }
  | { status: 'ambiguous' }
  | { status: 'replayed' }
  | { status: 'config_error'; message: string }
  | { status: 'error'; message: string }

/** How far before the transaction's creation a transfer may predate it (clock skew / paid-while-loading). */
const MATCH_WINDOW_SKEW_MS = 10 * 60 * 1000

/**
 * The school's binance_personal config, decrypted. Returns null when the
 * tenant has not configured Pay ID + API credentials (feature unavailable).
 */
export async function loadBinancePersonalConfig(
  admin: SupabaseClient,
  tenantId: string,
): Promise<{ payId: string; apiKey: string; apiSecret: string } | null> {
  const { data: row } = await admin
    .from('tenant_payment_wallets')
    .select('wallet_address, credentials')
    .eq('tenant_id', tenantId)
    .eq('provider', 'binance_personal')
    .maybeSingle()
  const creds = row?.credentials as { api_key?: string; api_secret?: string } | null
  if (!row?.wallet_address || !creds?.api_key || !creds?.api_secret) return null
  try {
    const masterKey = getPaymentCredentialsKey()
    return {
      payId: row.wallet_address,
      apiKey: decryptCredential(creds.api_key, masterKey),
      apiSecret: decryptCredential(creds.api_secret, masterKey),
    }
  } catch (err) {
    console.error(`[binance-personal] failed to decrypt credentials for tenant ${tenantId}:`, err)
    return null
  }
}

/** Fetch recent incoming Pay transfers for a tenant (one weight-heavy call — batch per tenant). */
export async function fetchTenantPayTransfers(
  config: { apiKey: string; apiSecret: string },
  sinceMs: number,
): Promise<BinancePayTransfer[]> {
  const provider = new BinancePersonalProvider(config.apiKey, config.apiSecret)
  return provider.listPayTransactions({
    startTime: Math.max(0, sinceMs - MATCH_WINDOW_SKEW_MS),
    endTime: Date.now(),
    limit: 100,
  })
}

/** True when the note carries the code as a standalone digit run ("14825" must NOT match code "482"). */
export function noteContainsCode(note: string, code: string): boolean {
  return note.split(/\D+/).includes(code)
}

const AMOUNT_EPSILON = 1e-6

/**
 * Match one pending transaction against the tenant's recent transfers and, on
 * a deterministic match, flip it → successful consuming the Binance orderId.
 * Caller must have checked `payment_provider === 'binance_personal'` and
 * `status === 'pending'`, and supplies transfers fetched once per tenant.
 */
export async function reconcileBinancePersonalTransaction(
  admin: SupabaseClient,
  tx: BinancePersonalTx,
  transfers: BinancePayTransfer[],
): Promise<BinanceReconcileResult> {
  const expected = Number(tx.amount)
  const code = String(tx.transaction_id)
  const createdMs = tx.transaction_date ? new Date(tx.transaction_date).getTime() : 0
  const windowStart = createdMs - MATCH_WINDOW_SKEW_MS

  // USDT-only, inside the window (USD prices are matched 1:1 against USDT,
  // same convention as the merchant Binance provider).
  const eligible = transfers.filter(
    (t) => t.currency.toUpperCase() === 'USDT' && (t.transactionTime === 0 || t.transactionTime >= windowStart),
  )

  // Rule 1 — note carries the payment code and the amount covers the price.
  const noteMatches = eligible.filter(
    (t) => noteContainsCode(t.note, code) && t.amount >= expected - AMOUNT_EPSILON,
  )

  let candidates = noteMatches
  let sawExactAmount = false
  if (candidates.length === 0) {
    // Rule 2 — exact amount, and we are the ONLY pending transaction that
    // could claim it in this tenant. Otherwise rule 3: ambiguous, never guess.
    const exactMatches = eligible.filter((t) => Math.abs(t.amount - expected) < AMOUNT_EPSILON)
    sawExactAmount = exactMatches.length > 0
    if (exactMatches.length > 0) {
      const { count, error: countErr } = await admin
        .from('transactions')
        .select('transaction_id', { count: 'exact', head: true })
        .eq('tenant_id', tx.tenant_id)
        .eq('payment_provider', 'binance_personal')
        .eq('status', 'pending')
        .eq('amount', expected)
      if (countErr) {
        return { status: 'error', message: 'Failed to check for colliding pending transactions' }
      }
      if ((count ?? 0) <= 1) {
        candidates = exactMatches
      }
    }
  }

  if (candidates.length === 0) {
    return sawExactAmount ? { status: 'ambiguous' } : { status: 'not_found' }
  }

  // Flip → successful, consuming the orderId. If a candidate's orderId was
  // already consumed by another order (23505), try the next one — several
  // transfers can legitimately carry the same amount.
  for (const transfer of candidates) {
    const { data: flipped, error: flipErr } = await admin
      .from('transactions')
      .update({
        status: 'successful',
        provider_charge_id: transfer.orderId,
        // Plan purchases: the after_transaction_update trigger copies
        // provider_subscription_id onto the subscription row it creates.
        ...(tx.plan_id ? { provider_subscription_id: transfer.orderId } : {}),
      })
      .eq('transaction_id', tx.transaction_id)
      .eq('status', 'pending')
      .select('transaction_id')
      .maybeSingle()

    if (flipErr) {
      if ((flipErr as { code?: string }).code === '23505') continue
      console.error(`[binance-personal-reconcile] failed to flip tx ${tx.transaction_id}:`, flipErr)
      return { status: 'error', message: 'Failed to record payment' }
    }
    if (!flipped) {
      // A concurrent poll/cron already confirmed this transaction.
      return { status: 'confirmed', alreadyProcessed: true }
    }
    console.log(`[binance-personal-reconcile] confirmed tx ${tx.transaction_id} (orderId ${transfer.orderId})`)
    return { status: 'confirmed', orderId: transfer.orderId }
  }

  // Every matching transfer was already consumed by another order.
  console.warn(`[binance-personal-reconcile] all candidate orderIds already consumed for tx ${tx.transaction_id}`)
  return { status: 'replayed' }
}
