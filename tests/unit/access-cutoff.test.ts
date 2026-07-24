import { describe, it, expect } from 'vitest'
import { decideAccessCutoffAction, ACCESS_CUTOFF_GRACE_DAYS } from '@/lib/billing/access-cutoff'
import type { PlanLimitViolation } from '@/lib/billing/plan-limits'

describe('decideAccessCutoffAction', () => {
  it('issue #494 scenario: 10,000 students on a 50-student-max plan schedules a cutoff', () => {
    const now = new Date('2026-07-24T00:00:00.000Z')
    const violations: PlanLimitViolation[] = [
      { resource: 'students', current: 10000, max: 50, reduceBy: 9950 },
    ]
    const result = decideAccessCutoffAction({
      violations,
      currentCutoffAt: null,
      now,
    })
    expect(result.action).toBe('schedule')
    expect(result.cutoffAt).toBe(new Date('2026-08-07T00:00:00.000Z').toISOString())
  })

  it('no violations and no existing cutoff → none', () => {
    const result = decideAccessCutoffAction({
      violations: [],
      currentCutoffAt: null,
      now: new Date('2026-07-24T00:00:00.000Z'),
    })
    expect(result.action).toBe('none')
    expect(result.cutoffAt).toBeUndefined()
  })

  it('already scheduled and still over limit does not reschedule (idempotent)', () => {
    const violations: PlanLimitViolation[] = [
      { resource: 'students', current: 10000, max: 50, reduceBy: 9950 },
    ]
    const result = decideAccessCutoffAction({
      violations,
      currentCutoffAt: '2026-07-20T00:00:00.000Z',
      now: new Date('2026-07-24T00:00:00.000Z'),
    })
    expect(result.action).toBe('none')
    expect(result.cutoffAt).toBeUndefined()
  })

  it('resolved usage clears an active cutoff', () => {
    const result = decideAccessCutoffAction({
      violations: [],
      currentCutoffAt: '2026-07-20T00:00:00.000Z',
      now: new Date('2026-07-24T00:00:00.000Z'),
    })
    expect(result.action).toBe('clear')
  })

  it('a courses-only violation also triggers schedule (not student-specific)', () => {
    const violations: PlanLimitViolation[] = [
      { resource: 'courses', current: 20, max: 15, reduceBy: 5 },
    ]
    const now = new Date('2026-07-24T00:00:00.000Z')
    const result = decideAccessCutoffAction({
      violations,
      currentCutoffAt: null,
      now,
    })
    expect(result.action).toBe('schedule')
    expect(result.cutoffAt).toBe(
      new Date(now.getTime() + ACCESS_CUTOFF_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString()
    )
  })

  it('multiple simultaneous violations still yield a single schedule action', () => {
    const violations: PlanLimitViolation[] = [
      { resource: 'courses', current: 20, max: 15, reduceBy: 5 },
      { resource: 'students', current: 10000, max: 50, reduceBy: 9950 },
    ]
    const now = new Date('2026-07-24T00:00:00.000Z')
    const result = decideAccessCutoffAction({
      violations,
      currentCutoffAt: null,
      now,
    })
    expect(result.action).toBe('schedule')
    expect(result.cutoffAt).toBe(new Date('2026-08-07T00:00:00.000Z').toISOString())
  })
})
