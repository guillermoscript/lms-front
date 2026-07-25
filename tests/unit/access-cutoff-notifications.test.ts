/**
 * Issue #517 — the access-cutoff notification ladder.
 *
 * #494 shipped one email per cutoff and no retry. These tests pin the two
 * pure decisions that replace it: which rung of the ladder is due
 * (`dueCutoffNotificationStage`) and what an admin should be told in-app
 * (`describeAccessCutoff`).
 */
import { describe, it, expect } from 'vitest'
import { dueCutoffNotificationStage } from '@/lib/billing/access-cutoff'
import { describeAccessCutoff } from '@/lib/billing/access-cutoff-notice'
import { accessCutoffWarningTemplate } from '@/lib/email/templates/access-cutoff-warning'

const CUTOFF = '2026-08-07T00:00:00.000Z'
const at = (iso: string) => new Date(iso)

describe('dueCutoffNotificationStage', () => {
  it('sends the scheduling notice immediately when the ledger is empty', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: [],
        now: at('2026-07-24T00:00:00.000Z'), // T-14
      })
    ).toBe('scheduled')
  })

  it('stays quiet mid-window once the scheduling notice is recorded', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled'],
        now: at('2026-07-28T00:00:00.000Z'), // T-10
      })
    ).toBeNull()
  })

  it('sends the 7-day reminder at T-7', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled'],
        now: at('2026-07-31T00:00:00.000Z'),
      })
    ).toBe('reminder_7d')
  })

  it('does not repeat the 7-day reminder once recorded', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled', 'reminder_7d'],
        now: at('2026-08-02T00:00:00.000Z'), // T-5
      })
    ).toBeNull()
  })

  it('sends the final reminder at T-1', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled', 'reminder_7d'],
        now: at('2026-08-06T00:00:00.000Z'),
      })
    ).toBe('reminder_1d')
  })

  it('sends the enforced notice once the cutoff has passed', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled', 'reminder_7d', 'reminder_1d'],
        now: at('2026-08-07T00:00:01.000Z'),
      })
    ).toBe('enforced')
  })

  it('goes silent after the enforced notice — no daily nagging', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled', 'reminder_7d', 'reminder_1d', 'enforced'],
        now: at('2026-08-20T00:00:00.000Z'),
      })
    ).toBeNull()
  })

  // The retry the issue asks for: a send that threw is never written to the
  // ledger, so the stage is still unsent on the next daily sweep.
  it('retries a scheduling notice whose sends all failed', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: [],
        now: at('2026-07-25T00:00:00.000Z'), // next sweep after a failed T-14 send
      })
    ).toBe('scheduled')
  })

  it('retries a failed 7-day reminder on the following sweep', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: ['scheduled'],
        now: at('2026-08-01T00:00:00.000Z'), // T-6, reminder_7d still unsent
      })
    ).toBe('reminder_7d')
  })

  // A stale rung must never overtake an urgent one: two contradictory
  // messages in one inbox is worse than one missing message.
  it('supersedes an undelivered early rung once a more urgent one is reached', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: [],
        now: at('2026-08-06T12:00:00.000Z'), // T-12h, nothing ever sent
      })
    ).toBe('reminder_1d')
  })

  it('only ever sends the enforced notice after the cutoff, never a warning', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: CUTOFF,
        sentStages: [], // every earlier rung failed
        now: at('2026-08-08T00:00:00.000Z'),
      })
    ).toBe('enforced')
  })

  // A cleared-then-rescheduled cutoff is a new deadline: the ledger is keyed
  // on cutoff_at, so the new window starts with an empty sentStages list.
  it('starts a fresh ladder for a rescheduled cutoff', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: '2026-09-15T00:00:00.000Z',
        sentStages: [],
        now: at('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('scheduled')
  })

  it('returns null for an unparseable cutoff rather than mailing garbage', () => {
    expect(
      dueCutoffNotificationStage({
        cutoffAt: 'not-a-date',
        sentStages: [],
        now: at('2026-08-01T00:00:00.000Z'),
      })
    ).toBeNull()
  })
})

describe('describeAccessCutoff', () => {
  it('returns null when no cutoff is scheduled', () => {
    expect(describeAccessCutoff({ cutoffAt: null, now: at('2026-07-24T00:00:00.000Z') })).toBeNull()
  })

  it('reports days remaining while the cutoff is still in the future', () => {
    expect(describeAccessCutoff({ cutoffAt: CUTOFF, now: at('2026-07-24T00:00:00.000Z') })).toEqual({
      cutoffAt: CUTOFF,
      active: false,
      daysRemaining: 14,
    })
  })

  it('rounds a partial day up so "tomorrow" never reads as 0 days', () => {
    const notice = describeAccessCutoff({ cutoffAt: CUTOFF, now: at('2026-08-06T06:00:00.000Z') })
    expect(notice).toEqual({ cutoffAt: CUTOFF, active: false, daysRemaining: 1 })
  })

  it('flags the cutoff as active once it has passed', () => {
    expect(describeAccessCutoff({ cutoffAt: CUTOFF, now: at('2026-08-07T00:00:01.000Z') })).toEqual({
      cutoffAt: CUTOFF,
      active: true,
      daysRemaining: 0,
    })
  })

  it('returns null for an unparseable cutoff rather than rendering NaN days', () => {
    expect(describeAccessCutoff({ cutoffAt: 'not-a-date', now: at('2026-08-01T00:00:00.000Z') })).toBeNull()
  })
})

describe('accessCutoffWarningTemplate stages', () => {
  const base = {
    schoolName: 'Code Academy',
    planName: 'Free',
    reasons: ['51 active students exceed the Free plan’s limit of 50'],
    cutoffDate: 'August 7, 2026',
    billingUrl: 'https://code-academy.example.com/dashboard/admin/billing',
  }

  it('defaults to the #494 scheduling copy when no stage is given', () => {
    const { subject } = accessCutoffWarningTemplate(base)
    expect(subject).toBe(
      'Action required: student access to Code Academy will be cut off on August 7, 2026'
    )
  })

  it('gives each rung a distinct subject so reminders are not threaded as duplicates', () => {
    const subjects = (['scheduled', 'reminder_7d', 'reminder_1d', 'enforced'] as const).map(
      (stage) => accessCutoffWarningTemplate({ ...base, stage }).subject
    )
    expect(new Set(subjects).size).toBe(4)
  })

  it('writes the enforced notice in the past tense — access is already gone', () => {
    const { subject, html } = accessCutoffWarningTemplate({ ...base, stage: 'enforced' })
    expect(subject).toBe('Student access to Code Academy is now paused')
    expect(html).toContain('has lost access')
    expect(html).not.toContain('will lose access')
  })

  it('states the school-wide blast radius on every rung', () => {
    for (const stage of ['scheduled', 'reminder_7d', 'reminder_1d', 'enforced'] as const) {
      expect(accessCutoffWarningTemplate({ ...base, stage }).html).toMatch(
        /every student at your school/i
      )
    }
  })
})
