import { describe, it, expect } from 'vitest'
import { decidePullAction, type PullDecisionRow, type PullDecisionState } from '@/lib/payments/solana-pull-decision'

/**
 * The crank must NEVER charge a subscription the DB no longer considers active,
 * must finalize (not renew) a subscription that reached its period-end cancel
 * (issue #460) — and must RENEW everything else (issue #545).
 *
 * These fixtures use values the `subscriptions` table can actually hold. The
 * suite previously fixed `cancel_at: null` on a column that was
 * `NOT NULL DEFAULT timezone('utc', now())`, so it tested a row shape that
 * could not exist: every real row carried a cancel date in the past, the
 * `cancel_at <= now` branch fired at the first rollover, and native
 * `solana_subs` recurring billing could never renew — green tests the whole
 * time. `20260726120000_subscription_cancel_at_contract.sql` made `cancel_at`
 * nullable with the invariant `cancel_at IS NULL OR cancel_at_period_end`, so
 * the three shapes below are now the only ones the schema permits, plus the
 * legacy poisoned shape that used to be universal.
 */

const NOW = 1_700_000_000 // fixed unix seconds
const iso = (unixSec: number) => new Date(unixSec * 1000).toISOString()

// An active, freshly-started period: started 2h ago, 24h period → not due.
const activeState: PullDecisionState = {
  expiresAtTs: BigInt(0),
  currentPeriodStartTs: BigInt(NOW - 2 * 3600),
  periodHours: BigInt(24),
}

// A period that has rolled over: started 25h ago, 24h period → due 1h ago.
const dueState: PullDecisionState = {
  expiresAtTs: BigInt(0),
  currentPeriodStartTs: BigInt(NOW - 25 * 3600),
  periodHours: BigInt(24),
}

/** Renewing normally: no cancel scheduled, so no cancel date (#545 contract). */
const activeRow: PullDecisionRow = {
  subscription_status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
}

/** Scheduled to cancel: the flag is set and the date is this period's end. */
const cancelScheduledRow: PullDecisionRow = {
  subscription_status: 'active',
  cancel_at_period_end: true,
  cancel_at: iso(NOW - 3600),
}

/**
 * What every row looked like before the #545 migration: `cancel_at` defaulted
 * to the row's creation time and no writer ever cleared it, while nobody had
 * scheduled anything. This shape must renew.
 */
const legacyPoisonedRow: PullDecisionRow = {
  subscription_status: 'active',
  cancel_at_period_end: false,
  cancel_at: iso(NOW - 30 * 24 * 3600),
}

describe('decidePullAction', () => {
  it('pulls when active and the period has rolled over', () => {
    const d = decidePullAction({ row: activeRow, state: dueState, nowSec: NOW })
    expect(d.action).toBe('pull')
  })

  it('skips when the period has not rolled over yet', () => {
    const d = decidePullAction({ row: activeRow, state: activeState, nowSec: NOW })
    expect(d.action).toBe('skip')
  })

  it('never pulls a row whose DB status is not active (mid-run cancel race)', () => {
    for (const status of ['canceled', 'expired', 'past_due', 'renewed']) {
      const d = decidePullAction({
        row: { ...activeRow, subscription_status: status },
        state: dueState, // due — would pull if the gate were missing
        nowSec: NOW,
      })
      expect(d.action).toBe('skip')
    }
  })

  it('finalizes to canceled (does NOT pull) when set to cancel_at_period_end and due', () => {
    const d = decidePullAction({ row: cancelScheduledRow, state: dueState, nowSec: NOW })
    expect(d.action).toBe('cancel')
  })

  // ── #545: a cancel DATE is not a cancel SCHEDULE ──────────────────────────
  it('RENEWS a due subscription whose cancel_at is in the past but is not scheduled to cancel', () => {
    // The shipped bug: `cancel_at` defaulted to now() at INSERT, so this was
    // EVERY solana_subs row. The crank canceled instead of pulling — the
    // student lost access at period end and the school was never paid again.
    const d = decidePullAction({ row: legacyPoisonedRow, state: dueState, nowSec: NOW })
    expect(d.action).toBe('pull')
    if (d.action === 'pull') {
      expect(d.periodEndSec).toBe(BigInt(NOW - 3600))
    }
  })

  it('renews a due subscription whose cancel_at was left behind by a reactivate', () => {
    // Both reactivate paths now clear cancel_at with the flag, but a row that
    // predates that (or any future writer that forgets) must still renew.
    const d = decidePullAction({
      row: { ...activeRow, cancel_at: iso(NOW + 30 * 24 * 3600) },
      state: dueState,
      nowSec: NOW,
    })
    expect(d.action).toBe('pull')
  })

  it('cancels on the flag alone, even with no cancel_at recorded', () => {
    const d = decidePullAction({
      row: { ...cancelScheduledRow, cancel_at: null },
      state: dueState,
      nowSec: NOW,
    })
    expect(d.action).toBe('cancel')
  })

  it('does not finalize a cancel-scheduled row until the period actually rolls', () => {
    // cancel_at_period_end is set, but the period is not due yet → still just skip.
    const d = decidePullAction({ row: cancelScheduledRow, state: activeState, nowSec: NOW })
    expect(d.action).toBe('skip')
  })

  it('expires the row once the on-chain delegation is cancelled and past grace', () => {
    const d = decidePullAction({
      row: activeRow,
      state: { ...dueState, expiresAtTs: BigInt(NOW - 10) },
      nowSec: NOW,
    })
    expect(d.action).toBe('expire')
  })

  it('does not expire while the on-chain grace deadline is still in the future', () => {
    // expiresAtTs set but in the future — treat as still live, and (period due) pull.
    const d = decidePullAction({
      row: activeRow,
      state: { ...dueState, expiresAtTs: BigInt(NOW + 10_000) },
      nowSec: NOW,
    })
    expect(d.action).toBe('pull')
  })

  it('status gate wins over an on-chain expiry (canceled row is left alone)', () => {
    const d = decidePullAction({
      row: { ...activeRow, subscription_status: 'canceled' },
      state: { ...dueState, expiresAtTs: BigInt(NOW - 10) },
      nowSec: NOW,
    })
    expect(d.action).toBe('skip')
  })

  it('renews period after period — a subscription is never spuriously finalized', () => {
    // Three consecutive rollovers of the same never-canceled subscription. The
    // acceptance criterion for #545: a solana_subs subscription RENEWS at
    // period end, with the column values a real row carries.
    const periodHours = BigInt(24)
    let periodStart = BigInt(NOW - 25 * 3600)
    for (let period = 0; period < 3; period++) {
      const at = Number(periodStart + periodHours * BigInt(3600)) + 60
      const d = decidePullAction({
        row: activeRow,
        state: { expiresAtTs: BigInt(0), currentPeriodStartTs: periodStart, periodHours },
        nowSec: at,
      })
      expect(d.action).toBe('pull')
      if (d.action !== 'pull') return
      periodStart = d.periodEndSec
    }
  })
})
