import { describe, it, expect } from 'vitest'
import { decidePullAction, type PullDecisionRow, type PullDecisionState } from '@/lib/payments/solana-pull-decision'

/**
 * The crank must NEVER charge a subscription the DB no longer considers active,
 * and must finalize (not renew) a subscription that reached its period-end
 * cancel (issue #460). These tests pin that gate.
 */

const NOW = 1_700_000_000 // fixed unix seconds

// An active, freshly-started period: started 2h ago, 24h period → not due.
const activeState: PullDecisionState = {
  expiresAtTs: BigInt(0),
  currentPeriodStartTs: BigInt(NOW - 2 * 3600),
  periodHours: BigInt(24),
}

// A period that has rolled over: started 25h ago, 24h period → due.
const dueState: PullDecisionState = {
  expiresAtTs: BigInt(0),
  currentPeriodStartTs: BigInt(NOW - 25 * 3600),
  periodHours: BigInt(24),
}

const activeRow: PullDecisionRow = {
  subscription_status: 'active',
  cancel_at_period_end: false,
  cancel_at: null,
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
    const d = decidePullAction({
      row: { ...activeRow, cancel_at_period_end: true },
      state: dueState,
      nowSec: NOW,
    })
    expect(d.action).toBe('cancel')
  })

  it('finalizes to canceled when cancel_at has passed and the period is due', () => {
    const d = decidePullAction({
      row: { ...activeRow, cancel_at: new Date((NOW - 3600) * 1000).toISOString() },
      state: dueState,
      nowSec: NOW,
    })
    expect(d.action).toBe('cancel')
  })

  it('does not finalize a cancel-scheduled row until the period actually rolls', () => {
    // cancel_at_period_end is set, but the period is not due yet → still just skip.
    const d = decidePullAction({
      row: { ...activeRow, cancel_at_period_end: true },
      state: activeState,
      nowSec: NOW,
    })
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
})
