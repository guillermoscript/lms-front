/**
 * Shared one-time Solana confirmation core (issue #280 Phase 5, #467).
 *
 * The confirm logic for a one-time `solana` payment — resolve the tenant's
 * wallet + revenue split + the settlement locked at checkout, verify BOTH split
 * legs on-chain, and flip the transaction pending → successful (consuming the
 * on-chain signature) — is needed in two places:
 *
 *   1. `/api/payments/solana/verify` — the browser poll from the checkout page.
 *   2. `/api/cron/solana-reconcile` — the backstop cron for payments where the
 *      student closed the tab before the poll confirmed (#467).
 *
 * Keeping it here means the two paths can never drift. The status-guarded flip
 * (`.eq('status','pending')`) plus the `provider_charge_id` signature-consume
 * (partial unique index `transactions_provider_charge_id_unique`) keep it
 * idempotent against concurrent poll + cron runs and prevent one on-chain
 * payment from confirming two orders.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifySplitTransfer } from './solana-split'

/** The transaction columns the reconciler needs. */
export interface OneTimeSolanaTx {
  transaction_id: number | string
  amount: number
  tenant_id: string
  provider_subscription_id: string | null
  settlement_currency: string | null
  settlement_base: number | null
  settlement_mint: string | null
}

/**
 * Outcome of a reconciliation attempt.
 *  - `confirmed`        — the transfer validated on-chain and the tx is now
 *                         successful (`alreadyProcessed` when a concurrent
 *                         poll/cron beat us to the flip).
 *  - `not_found`        — no matching transfer on-chain yet; keep waiting.
 *  - `validation_error` — a tx was found on-chain but the legs don't match
 *                         (wrong amount/recipient) or an RPC error occurred.
 *  - `replayed`         — the signature already backs another successful tx.
 *  - `config_error`     — Solana / tenant wallet not configured.
 *  - `error`            — an unexpected failure recording the payment.
 */
export type ReconcileResult =
  | { status: 'confirmed'; signature?: string; alreadyProcessed?: boolean }
  | { status: 'not_found' }
  | { status: 'validation_error' }
  | { status: 'replayed' }
  | { status: 'config_error'; message: string }
  | { status: 'error'; message: string }

/**
 * Confirm a single pending one-time `solana` transaction against the chain and,
 * on a validated split transfer, flip it → successful. Caller must have already
 * checked `payment_provider === 'solana'` and `status === 'pending'`.
 *
 * @param admin  A service-role Supabase client (bypasses RLS — resolves the
 *               tenant wallet + revenue split and performs the guarded flip).
 * @param tx     The pending transaction row.
 */
export async function reconcileSolanaOneTimeTransaction(
  admin: SupabaseClient,
  tx: OneTimeSolanaTx,
): Promise<ReconcileResult> {
  const referencePubkey = tx.provider_subscription_id
  if (!referencePubkey) {
    return { status: 'config_error', message: 'Transaction has no Solana reference' }
  }

  const rpcUrl = process.env.SOLANA_RPC_URL
  const platformWallet = process.env.SOLANA_PLATFORM_WALLET
  if (!rpcUrl || !platformWallet) {
    return { status: 'config_error', message: 'Solana not configured' }
  }

  // Resolve the same split inputs the /tx endpoint used: school wallet (per
  // tenant), platform wallet (env), split percent (revenue_splits).
  const { data: wallet } = await admin
    .from('tenant_payment_wallets')
    .select('wallet_address')
    .eq('tenant_id', tx.tenant_id)
    .eq('provider', 'solana')
    .maybeSingle()
  if (!wallet?.wallet_address) {
    return { status: 'config_error', message: 'School has not configured a Solana wallet' }
  }
  const { data: split } = await admin
    .from('revenue_splits')
    .select('platform_percentage')
    .eq('tenant_id', tx.tenant_id)
    .maybeSingle()
  const platformPercent = Number(split?.platform_percentage ?? 20)

  // Verify against the settlement LOCKED at checkout (amount + token), so a
  // native-SOL payment is checked against the exact lamports quoted then — the
  // SOL/USD rate has moved since. Legacy rows fall back to env + USD amount.
  let vTotalBase: number | undefined
  let vSplTokenStr: string | null
  let vDecimals: number
  if (tx.settlement_base != null && tx.settlement_currency) {
    vTotalBase = Number(tx.settlement_base)
    vSplTokenStr = tx.settlement_mint
    vDecimals = tx.settlement_currency === 'usdc' ? 6 : 9
  } else {
    const usdcMint = process.env.SOLANA_USDC_MINT
    vSplTokenStr = usdcMint || null
    vDecimals = usdcMint ? 6 : 9
  }

  // Confirm BOTH split legs on-chain (custom verification — validateTransfer
  // only handles a single recipient).
  let result: { confirmed: boolean; signature?: string }
  try {
    result = await verifySplitTransfer({
      connection: new Connection(rpcUrl, 'confirmed'),
      reference: new PublicKey(referencePubkey),
      schoolWallet: new PublicKey(wallet.wallet_address),
      platformWallet: new PublicKey(platformWallet),
      amountMajor: vTotalBase == null ? Number(tx.amount) : undefined,
      totalBase: vTotalBase,
      platformPercent,
      splToken: vSplTokenStr ? new PublicKey(vSplTokenStr) : undefined,
      decimals: vDecimals,
    })
  } catch (err) {
    // Found on-chain but legs don't match (wrong amount/recipient) or RPC error.
    console.error(`[solana-reconcile] verifySplitTransfer failed for tx ${tx.transaction_id}:`, err)
    return { status: 'validation_error' }
  }

  if (!result.confirmed) {
    // Not found on-chain yet — keep waiting.
    return { status: 'not_found' }
  }

  // Flip → successful (status-guarded for idempotency). We also CONSUME the
  // on-chain signature via provider_charge_id: the partial-unique index
  // (transactions_provider_charge_id_unique) guarantees a given signature backs
  // only one successful transaction, so one payment carrying multiple reference
  // keys cannot confirm multiple orders (H1). The after_transaction_update
  // trigger creates the entitlements.
  const { data: flipped, error: flipErr } = await admin
    .from('transactions')
    .update({ status: 'successful', provider_charge_id: result.signature })
    .eq('transaction_id', tx.transaction_id)
    .eq('status', 'pending')
    .select('transaction_id')
    .maybeSingle()

  if (flipErr) {
    // 23505 = this signature already backs another successful transaction — a
    // replay of one on-chain payment against a second order. Reject it.
    if ((flipErr as { code?: string }).code === '23505') {
      console.warn(`[solana-reconcile] signature ${result.signature} already consumed by another transaction`)
      return { status: 'replayed' }
    }
    console.error(`[solana-reconcile] failed to flip tx ${tx.transaction_id}:`, flipErr)
    return { status: 'error', message: 'Failed to record payment' }
  }

  if (!flipped) {
    // A concurrent/earlier confirm already flipped this transaction (idempotency
    // guard matched 0 rows). Report success without implying we just did the work.
    console.log(`[solana-reconcile] tx ${tx.transaction_id} was already confirmed`)
    return { status: 'confirmed', alreadyProcessed: true }
  }

  console.log(`[solana-reconcile] confirmed tx ${tx.transaction_id} (sig ${result.signature})`)
  return { status: 'confirmed', signature: result.signature }
}
