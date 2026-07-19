/**
 * Pure decision logic for the Solana auto-pull crank (issue #460).
 *
 * The crank must NEVER charge a subscription that our DB no longer considers
 * active — otherwise a canceled subscription whose on-chain delegation is still
 * live keeps leaking money. This module isolates that "should I pull?" decision
 * so it can be unit-tested without any RPC or DB, and so the security-critical
 * gate lives in one obvious place.
 *
 * No Solana/DB imports — inputs are plain values (bigints for on-chain seconds,
 * numbers for wall-clock seconds), outputs are a tagged action.
 */

/** The subscription-row fields the decision depends on. */
export interface PullDecisionRow {
  subscription_status: string
  cancel_at_period_end: boolean | null
  /** ISO timestamp the row is scheduled to cancel at (period-end cancel). */
  cancel_at: string | null
}

/** The on-chain SubscriptionDelegation state the decision depends on. */
export interface PullDecisionState {
  /** 0 while active; non-zero once cancelled on-chain (grace deadline). */
  expiresAtTs: bigint
  currentPeriodStartTs: bigint
  periodHours: bigint
}

export type PullDecision =
  /** On-chain cancelled and past its grace deadline — finalize the row to `expired`. */
  | { action: 'expire'; reason: string }
  /** Period rolled over but the row is set to cancel — finalize to `canceled`, do NOT pull. */
  | { action: 'cancel'; reason: string }
  /** Nothing to do this run (period not due yet, or the row is no longer active). */
  | { action: 'skip'; reason: string }
  /** Period rolled over and the row is genuinely active — charge it. */
  | { action: 'pull'; reason: string; periodEndSec: bigint }

/**
 * Decide what the crank should do with one subscription this run.
 *
 * Order matters — the hard "is our DB still active?" gate comes first so a
 * cancel that landed mid-run (or a period-end cancel that reached its date) can
 * never fall through to a pull.
 */
export function decidePullAction(params: {
  row: PullDecisionRow
  state: PullDecisionState
  /** Current wall-clock time in unix seconds. */
  nowSec: number
}): PullDecision {
  const { row, state, nowSec } = params
  const now = BigInt(nowSec)

  // (1) Hard status gate. The crank query already filters `active`, but a cancel
  // can land between the query and this pull; re-checking here (the caller
  // re-fetches the row just before deciding) closes that race. Never charge a
  // row our DB doesn't consider active.
  if (row.subscription_status !== 'active') {
    return { action: 'skip', reason: `status is ${row.subscription_status}, not active` }
  }

  // (2) On-chain cancelled and past grace → expire our row (trigger revokes
  // access). This is the terminal state after a student revokes the delegation.
  if (state.expiresAtTs !== BigInt(0) && state.expiresAtTs <= now) {
    return { action: 'expire', reason: 'on-chain delegation cancelled and past grace' }
  }

  const periodEndSec = state.currentPeriodStartTs + state.periodHours * BigInt(3600)

  // (3) Period hasn't rolled over yet — nothing due.
  if (now < periodEndSec) {
    return { action: 'skip', reason: 'period not due yet' }
  }

  // (4) Period IS due. If the row is scheduled to cancel at period end, this is
  // the rollover it was waiting for: finalize to `canceled` instead of pulling.
  // Without this the crank would renew a subscription the admin already
  // canceled (the money leak in #460 — the on-chain delegation is still live,
  // so a pull would succeed and re-bill the student).
  const cancelDue = row.cancel_at
    ? BigInt(Math.floor(new Date(row.cancel_at).getTime() / 1000)) <= now
    : false
  if (row.cancel_at_period_end || cancelDue) {
    return { action: 'cancel', reason: 'scheduled to cancel at period end' }
  }

  // (5) Genuinely active and due — charge it.
  return { action: 'pull', reason: 'period rolled over on an active subscription', periodEndSec }
}
