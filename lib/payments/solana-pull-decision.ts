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
  /**
   * The ONLY signal that a cancel is scheduled (issue #545). Everything else
   * about the cancel — including when it takes effect — is derived from the
   * period, never from a stored date.
   */
  cancel_at_period_end: boolean | null
  /**
   * When the row is scheduled to terminate, or null when no cancel is
   * scheduled. Reported in the decision's `reason`, and DELIBERATELY not part
   * of the decision itself.
   *
   * This column used to be `NOT NULL DEFAULT now()` with no writer setting it
   * at creation, so every subscription was born with a cancel date in the past
   * and this function's old `cancelDue` branch canceled every `solana_subs`
   * subscription at its first rollover instead of renewing it (#545 bug 1).
   * `20260726120000_subscription_cancel_at_contract.sql` made the column
   * nullable and pinned `cancel_at IS NULL OR cancel_at_period_end`, but the
   * crank does not depend on that repair having reached any given database:
   * a stale or garbage `cancel_at` can no longer cost a school a renewal.
   */
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
  //
  // `cancel_at_period_end` is the whole test (#545). It used to be OR'd with a
  // `cancel_at <= now` check, and because `cancel_at` defaulted to now() on
  // every INSERT that OR was always true at the first rollover — no
  // `solana_subs` subscription could ever renew. A cancel date is a
  // consequence of the schedule, not evidence of one.
  if (row.cancel_at_period_end === true) {
    return {
      action: 'cancel',
      reason: row.cancel_at
        ? `scheduled to cancel at period end (${row.cancel_at})`
        : 'scheduled to cancel at period end',
    }
  }

  // (5) Genuinely active and due — charge it.
  return { action: 'pull', reason: 'period rolled over on an active subscription', periodEndSec }
}
