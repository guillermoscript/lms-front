/**
 * Shared split-pull helper for native Solana auto-pull subscriptions (issue
 * #280, Phase 6 — `solana_subs`).
 *
 * A single on-chain pull (`transfer_subscription`) targets ONE receiver, so a
 * platform-fee split needs TWO pulls: the school share, then the platform fee.
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
}

const USDC_DECIMALS = 6

/**
 * Execute the two split pulls (school then platform, if the platform share > 0)
 * for one billing period. Each `pullOnce` builds + signs the puller's
 * transfer_subscription instruction.
 */
export async function pullSplitForSubscription(p: PullSplitParams): Promise<void> {
  const mintPk = new PublicKey(p.mint)
  const schoolAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.schoolWallet)).toBase58()
  const platformAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.platformWallet)).toBase58()

  const { schoolBase, platformBase } = computeSplit(p.priceMajor, p.platformPercent, USDC_DECIMALS)

  // School share first.
  await pullOnce({
    rpcUrl: p.rpcUrl,
    pullerSecretKeyBase58: p.pullerSecretKeyBase58,
    subscriber: p.subscriber,
    merchant: p.merchant,
    planId: p.planId,
    mint: p.mint,
    receiverAta: schoolAta,
    amountBase: BigInt(schoolBase),
  })

  // Platform fee (only if non-zero).
  if (platformBase > 0) {
    await pullOnce({
      rpcUrl: p.rpcUrl,
      pullerSecretKeyBase58: p.pullerSecretKeyBase58,
      subscriber: p.subscriber,
      merchant: p.merchant,
      planId: p.planId,
      mint: p.mint,
      receiverAta: platformAta,
      amountBase: BigInt(platformBase),
    })
  }
}
