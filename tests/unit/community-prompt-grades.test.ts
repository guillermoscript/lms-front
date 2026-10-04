import { describe, expect, it } from 'vitest'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import {
  dueState,
  endOfLocalDayIso,
  filterRoster,
  gradeErrorKey,
  gradingStatus,
  normalizeGradeFeedback,
  parseDueAt,
  parseGradeScore,
  parseGradingFilter,
  rosterCounts,
  sortRoster,
  type GradingRow,
} from '@/lib/community/prompt-grades'
import {
  communityNotificationHref,
  communityNotificationMessage,
  communityNotificationPostLine,
  parseCommunityNotificationMeta,
} from '@/lib/community/notifications'

/**
 * Issue #873 — grading graded discussion prompts. Who may grade whom, the XP
 * and the notification are SQL (tests/sql/issue-873-community-prompt-grades.sql);
 * these pin the web's parsing, the roster and the notification contract.
 */

const POST = '11111111-1111-4111-8111-111111111111'
const GRADE = '22222222-2222-4222-8222-222222222222'
const TEACHER = '33333333-3333-4333-8333-333333333333'

function row(id: string, name: string | null, answers: number, grade: number | null): GradingRow {
  return {
    studentId: id,
    name,
    avatarUrl: null,
    answers: Array.from({ length: answers }, (_, i) => ({ id: `${id}-a${i}`, content: 'x', created_at: '2026-09-01T00:00:00Z' })),
    grade: grade === null ? null : { score: grade, feedback: null, graded_at: '2026-09-02T00:00:00Z' },
  }
}

describe('parseGradeScore', () => {
  it('accepts whole numbers 0–100 from numbers and strings', () => {
    expect(parseGradeScore(0)).toBe(0)
    expect(parseGradeScore(100)).toBe(100)
    expect(parseGradeScore('85')).toBe(85)
    expect(parseGradeScore(' 7 ')).toBe(7)
  })

  it('refuses anything else', () => {
    for (const bad of [-1, 101, 50.5, '50.5', '', '1e2', 'abc', '-3', '101', null, undefined, NaN, {}]) {
      expect(parseGradeScore(bad)).toBeNull()
    }
  })
})

describe('normalizeGradeFeedback', () => {
  it('trims, turns blank into null and refuses overlong text', () => {
    expect(normalizeGradeFeedback('  Good work  ')).toBe('Good work')
    expect(normalizeGradeFeedback('   ')).toBeNull()
    expect(normalizeGradeFeedback(undefined)).toBeNull()
    expect(normalizeGradeFeedback('x'.repeat(5001))).toBe('invalid')
    expect(normalizeGradeFeedback(42)).toBe('invalid')
  })
})

describe('due dates', () => {
  it('parseDueAt normalises an ISO timestamp and refuses garbage', () => {
    expect(parseDueAt(null)).toBeNull()
    expect(parseDueAt('')).toBeNull()
    expect(parseDueAt('2026-10-03T21:59:59.999Z')).toBe('2026-10-03T21:59:59.999Z')
    expect(parseDueAt('tomorrow')).toBe('invalid')
  })

  it('endOfLocalDayIso is the last millisecond of that local day', () => {
    const iso = endOfLocalDayIso('2026-10-03')!
    const d = new Date(iso)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 3, 23, 59])
    expect(endOfLocalDayIso('03/10/2026')).toBeNull()
  })

  it('dueState reads overdue, today and N days', () => {
    const now = Date.parse('2026-10-01T12:00:00Z')
    expect(dueState(null, now)).toEqual({ kind: 'none' })
    expect(dueState('nope', now)).toEqual({ kind: 'none' })
    expect(dueState('2026-10-01T11:00:00Z', now)).toEqual({ kind: 'overdue' })
    expect(dueState('2026-10-01T20:00:00Z', now)).toEqual({ kind: 'today' })
    expect(dueState('2026-10-04T12:00:00Z', now)).toEqual({ kind: 'days', days: 3 })
    expect(dueState('2026-10-04T13:00:00Z', now)).toEqual({ kind: 'days', days: 4 })
  })
})

describe('the grading roster', () => {
  const rows = [
    row('d', 'Dora', 0, null),
    row('c', 'carl', 2, 70),
    row('b', 'Bea', 1, null),
    row('a', 'Ana', 0, 0),
    row('e', null, 1, null),
  ]

  it('a grade wins over "no answer"; an answer without a grade waits', () => {
    expect(gradingStatus(row('x', null, 1, null))).toBe('ungraded')
    expect(gradingStatus(row('x', null, 0, null))).toBe('unanswered')
    expect(gradingStatus(row('x', null, 0, 0))).toBe('graded')
    expect(gradingStatus(row('x', null, 3, 90))).toBe('graded')
  })

  it('filters and counts by status', () => {
    expect(filterRoster(rows, 'all')).toHaveLength(5)
    expect(filterRoster(rows, 'ungraded').map((r) => r.studentId)).toEqual(['b', 'e'])
    expect(filterRoster(rows, 'graded').map((r) => r.studentId)).toEqual(['c', 'a'])
    expect(filterRoster(rows, 'unanswered').map((r) => r.studentId)).toEqual(['d'])
    expect(rosterCounts(rows)).toEqual({ all: 5, ungraded: 2, graded: 2, unanswered: 1 })
  })

  it('sorts to grade first, then graded, then no answer; by name within', () => {
    expect(sortRoster(rows).map((r) => r.studentId)).toEqual(['e', 'b', 'a', 'c', 'd'])
  })

  it('parseGradingFilter falls back to all', () => {
    expect(parseGradingFilter('graded')).toBe('graded')
    expect(parseGradingFilter(['unanswered'])).toBe('unanswered')
    expect(parseGradingFilter('everyone')).toBe('all')
    expect(parseGradingFilter(undefined)).toBe('all')
  })

  it('maps the database refusals', () => {
    expect(gradeErrorKey({ code: '42501' })).toBe('notAllowed')
    expect(gradeErrorKey({ code: '23514' })).toBe('invalid')
    expect(gradeErrorKey({ code: '23505' })).toBeNull()
    expect(gradeErrorKey(null)).toBeNull()
  })
})

describe('community_prompt_graded notifications', () => {
  const metadata = {
    kind: 'community_prompt_graded',
    post_id: POST,
    course_id: 2001,
    lesson_id: null,
    grade_id: GRADE,
    score: 85,
    actor_id: TEACHER,
    actor_name: 'Teacher',
    actor_role: 'teacher',
    post_label: 'Explain closures',
  }

  it('parses the metadata the trigger writes', () => {
    const meta = parseCommunityNotificationMeta(metadata)
    expect(meta).toMatchObject({ kind: 'community_prompt_graded', postId: POST, courseId: 2001, score: 85 })
  })

  it('a missing or out-of-range score still parses, without a number', () => {
    expect(parseCommunityNotificationMeta({ ...metadata, score: 250 })).toMatchObject({ score: null })
    expect(parseCommunityNotificationMeta({ ...metadata, score: undefined })).toMatchObject({ score: null })
  })

  it('links the student to the prompt in their course feed, no comment anchor', () => {
    const meta = parseCommunityNotificationMeta(metadata)!
    expect(communityNotificationHref(meta, 'student')).toBe(`/dashboard/student/courses/2001/community?post=${POST}`)
  })

  it('says the score, and names the prompt', () => {
    const meta = parseCommunityNotificationMeta(metadata)!
    expect(communityNotificationMessage(meta, 'Someone')).toEqual({ key: 'promptGraded', values: { score: 85 } })
    expect(communityNotificationPostLine(meta)).toEqual({ key: 'onPost', values: { post: 'Explain closures' } })
    const noScore = parseCommunityNotificationMeta({ ...metadata, score: null })!
    expect(communityNotificationMessage(noScore, 'Someone')).toEqual({ key: 'promptGradedNoScore', values: {} })
  })

  it('every message key exists in both catalogues', () => {
    for (const catalogue of [en, es]) {
      const n = catalogue.community.notifications as Record<string, unknown>
      expect(typeof n.promptGraded).toBe('string')
      expect(typeof n.promptGradedNoScore).toBe('string')
    }
  })
})
