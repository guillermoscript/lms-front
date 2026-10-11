/**
 * Shared split-pull helper for native Solana auto-pull subscriptions (issue
 * #280, Phase 6 — `solana_subs`).
 *
 * A single on-chain pull (`transfer_subscription`) targets ONE receiver, so a
 * platform-fee split needs two instructions in one atomic transaction.
 * Both must fit within the on-chain per-period cap (their sum = the plan price),
 * so the program enforces correctness — a duplicate/over-cap pull reverts.
 *
 * Used by:
 *   - /api/payments/solana/verify  → the FIRST charge right after subscribe
 *   - /api/cron/solana-pull        → each renewal period (the crank)
 */

import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddressSync } from '@solana/spl-token'
import { pullOnce } from './solana-subscriptions'
import { computeSplit } from './solana-split'

export interface PullSplitParams {
  rpcUrl: string
  /** Base58-encoded 64-byte puller keypair (whitelisted on the plan). */
  pullerSecretKeyBase58: string
  /** Subscriber's base58 pubkey (the delegator). */
  subscriber: string
  /** On-chain merchant / plan owner (= the puller pubkey). */
  merchant: string
  planId: bigint
  /** SPL mint (USDC) base58. */
  mint: string
  /** School wallet base58 — receives the school share. */
  schoolWallet: string
  /** Platform wallet base58 — receives the platform fee. */
  platformWallet: string
  /** Plan price in major units (e.g. 9.99 USDC). */
  priceMajor: number
  /** Platform fee percent (0–100), from revenue_splits.platform_percentage. */
  platformPercent: number
  /**
   * Base units already pulled in the CURRENT on-chain period (from
   * getSubscriptionState.amountPulledInPeriod). RESUMES a period whose first leg
   * landed but whose second leg failed: a leg already covered by
   * `alreadyPulledBase` is skipped so a retry never re-pulls it (which would
   * exceed the on-chain per-period cap and revert). Strictly monotonic — passing
   * it can only cause FEWER pulls, never more, so it cannot double-charge.
   * Defaults to 0 (pull both legs).
   */
  alreadyPulledBase?: bigint
}

const USDC_DECIMALS = 6

/** Retry transient submission errors; the on-chain period cap prevents a second
 * settlement. Confirmation uncertainty is reconciled from chain before granting
 * access or presenting a paid receipt.
 */
async function withRetries<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1500): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  throw lastErr
}

/**
 * Execute the outstanding split legs atomically and return confirmed signatures.
 */
export async function pullSplitForSubscription(p: PullSplitParams): Promise<string[]> {
  const mintPk = new PublicKey(p.mint)
  const schoolAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.schoolWallet)).toBase58()
  const platformAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.platformWallet)).toBase58()

  const { schoolBase, platformBase } = computeSplit(p.priceMajor, p.platformPercent, USDC_DECIMALS)
  const alreadyPulled = p.alreadyPulledBase ?? BigInt(0)

  // One transaction makes insufficient funds and fee-split failures atomic.
  // Historical partial periods can still resume only their outstanding legs.
  const transfers: { receiverAta: string; amountBase: bigint }[] = []
  if (alreadyPulled < BigInt(schoolBase)) {
    transfers.push({ receiverAta: schoolAta, amountBase: BigInt(schoolBase) })
  }
  if (platformBase > 0 && alreadyPulled < BigInt(schoolBase + platformBase)) {
    transfers.push({ receiverAta: platformAta, amountBase: BigInt(platformBase) })
  }
  const first = transfers[0]
  if (!first) return []
  const signature = await withRetries(() => pullOnce({
    rpcUrl: p.rpcUrl,
    pullerSecretKeyBase58: p.pullerSecretKeyBase58,
    subscriber: p.subscriber,
    merchant: p.merchant,
    planId: p.planId,
    mint: p.mint,
    ...first,
    additionalTransfers: transfers.slice(1),
  }))
  return [signature]
}
