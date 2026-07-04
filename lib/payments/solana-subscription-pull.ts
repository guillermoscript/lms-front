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

/**
 * Retries a transient RPC failure a few times within THIS invocation, before
 * the caller ever sees an error. This is what actually closes the H2
 * partial-failure gap (issue #343): if the platform leg fails only because of
 * a momentary RPC blip, the crank's period-rolled gate won't re-trigger this
 * pull until the NEXT period, so a failure that survives past this call is a
 * fee permanently missed. Safe to retry blindly — a transfer_subscription
 * pull is idempotent-by-cap (a duplicate/over-cap pull reverts on-chain), so
 * retrying can only reduce missed pulls, never double-charge.
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
 * Execute the two split pulls (school then platform, if the platform share > 0)
 * for one billing period. Each `pullOnce` builds + signs the puller's
 * transfer_subscription instruction.
 */
export async function pullSplitForSubscription(p: PullSplitParams): Promise<void> {
  const mintPk = new PublicKey(p.mint)
  const schoolAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.schoolWallet)).toBase58()
  const platformAta = getAssociatedTokenAddressSync(mintPk, new PublicKey(p.platformWallet)).toBase58()

  const { schoolBase, platformBase } = computeSplit(p.priceMajor, p.platformPercent, USDC_DECIMALS)
  const alreadyPulled = p.alreadyPulledBase ?? BigInt(0)

  // School share first — skip if this period already covered it (resume).
  if (alreadyPulled < BigInt(schoolBase)) {
    await withRetries(() =>
      pullOnce({
        rpcUrl: p.rpcUrl,
        pullerSecretKeyBase58: p.pullerSecretKeyBase58,
        subscriber: p.subscriber,
        merchant: p.merchant,
        planId: p.planId,
        mint: p.mint,
        receiverAta: schoolAta,
        amountBase: BigInt(schoolBase),
      }),
    )
  }

  // Platform fee (only if non-zero and not already covered this period).
  if (platformBase > 0 && alreadyPulled < BigInt(schoolBase + platformBase)) {
    await withRetries(() =>
      pullOnce({
        rpcUrl: p.rpcUrl,
        pullerSecretKeyBase58: p.pullerSecretKeyBase58,
        subscriber: p.subscriber,
        merchant: p.merchant,
        planId: p.planId,
        mint: p.mint,
        receiverAta: platformAta,
        amountBase: BigInt(platformBase),
      }),
    )
  }
}
