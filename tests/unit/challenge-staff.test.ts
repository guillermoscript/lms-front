import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { answerText, buildChallengeOverview, feedbackText, leaderboardOf, loadChallengeOverview, type StaffChallengeAttempt } from '@/lib/challenges/staff'

const ME = 'u-me'
const OTHER = 'u-other'
const exercises = [
  { id: 1, title: 'Mine', course_id: 10, is_challengeable: true },
  { id: 2, title: 'Theirs', course_id: 20, is_challengeable: true },
  { id: 3, title: 'Untouched', course_id: 10, is_challengeable: false },
]
const courses = [
  { course_id: 10, title: 'C10', author_id: ME },
  { course_id: 20, title: 'C20', author_id: OTHER },
]
const links = [
  { id: 'l1', token: 't1', exercise_id: 1, created_by: ME, active: true, created_at: '2026-10-02T00:00:00Z' },
  { id: 'l2', token: 't2', exercise_id: 1, created_by: ME, active: false, created_at: '2026-10-01T00:00:00Z' },
  { id: 'l3', token: 't3', exercise_id: 2, created_by: OTHER, active: true, created_at: '2026-10-03T00:00:00Z' },
]
const attempts = [
  { exercise_id: 1, user_id: ME, guest_token_hash: null, score: 80, is_official: true },
  { exercise_id: 1, user_id: null, guest_token_hash: 'g1', score: 0, is_official: true },
  { exercise_id: 1, user_id: null, guest_token_hash: 'g1', score: 90, is_official: false },
  { exercise_id: 1, user_id: OTHER, guest_token_hash: 'g2', score: 40, is_official: true },
  { exercise_id: 2, user_id: null, guest_token_hash: 'g9', score: 100, is_official: true },
]
const names = new Map([[ME, 'Ana'], [OTHER, 'Bob']])

describe('buildChallengeOverview', () => {
  it('aggregates per exercise for an admin', () => {
    const rows = buildChallengeOverview({ exercises, courses, links, attempts, names, scope: { userId: ME, role: 'admin' } })
    expect(rows.map((r) => r.exerciseId)).toEqual([1, 2]) // 3 has no links/plays/flag; most played first
    const r = rows[0]
    expect(r).toMatchObject({
      courseTitle: 'C10', creators: ['Ana'], activeLinks: 1, revokedLinks: 1, plays: 4, officialPlays: 3,
      uniquePlayers: 3, avgScore: 40, topScore: 80, claimedGuests: 1, firstLinkAt: '2026-10-01T00:00:00Z',
    })
  })

  it('a teacher only sees exercises of own courses', () => {
    const rows = buildChallengeOverview({ exercises, courses, links, attempts, names, scope: { userId: ME, role: 'teacher' } })
    expect(rows.map((r) => r.exerciseId)).toEqual([1])
  })

  it('lists a challengeable exercise with no plays (empty stats)', () => {
    const rows = buildChallengeOverview({ exercises, courses, links: [], attempts: [], names, scope: { userId: ME, role: 'teacher' } })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ plays: 0, avgScore: null, topScore: null, firstLinkAt: null })
  })

  it('never leaks hashes', () => {
    const json = JSON.stringify(buildChallengeOverview({ exercises, courses, links, attempts, names, scope: { userId: ME, role: 'admin' } }))
    expect(json).not.toMatch(/g1|g2|g9|guest_token_hash|ip_hash/)
  })
})

describe('loadChallengeOverview', () => {
  it('uses a fixed number of queries (no N+1)', async () => {
    const calls: string[] = []
    const builder = (table: string, data: unknown[]) => {
      calls.push(table)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'order', 'in']) b[m] = () => b
      b.range = async () => ({ data, error: null, count: data.length })
      b.then = (res: (v: unknown) => unknown) => res({ data, error: null })
      return b
    }
    const tables: Record<string, unknown[]> = {
      challenge_links: links, challenge_attempts: attempts, exercises, courses,
      profiles: [{ id: ME, full_name: 'Ana' }],
    }
    const admin = { from: (t: string) => builder(t, tables[t] ?? []) } as never
    const rows = await loadChallengeOverview({ tenantId: 't', userId: ME, role: 'admin' }, admin)
    expect(rows).toHaveLength(2)
    expect(calls.length).toBeLessThanOrEqual(6)
  })
})

describe('helpers', () => {
  it('reads answer/feedback jsonb defensively', () => {
    expect(answerText({ text: 'hi' })).toBe('hi')
    expect(answerText(null)).toBe('')
    expect(feedbackText({ feedback: 'ok', x: 1 })).toBe('ok')
    expect(feedbackText('str')).toBe('')
  })

  it('leaderboard: official only, score desc then earliest', () => {
    const mk = (id: string, score: number, createdAt: string, isOfficial = true) =>
      ({ id, score, createdAt, isOfficial, playerName: null, isGuest: true, passed: true, answer: '', feedback: '', linkId: null, linkPath: null }) as StaffChallengeAttempt
    const out = leaderboardOf([mk('a', 50, '2026-01-02'), mk('b', 80, '2026-01-03'), mk('c', 80, '2026-01-01'), mk('d', 99, '2026-01-01', false)])
    expect(out.map((x) => x.id)).toEqual(['c', 'b', 'a'])
  })
})

import { buildStudentRetos } from '@/lib/challenges/student'

describe('buildStudentRetos', () => {
  const at = (id: string, user: string | null, score: number, extra: Record<string, unknown> = {}) =>
    ({ id, exercise_id: 1, user_id: user, guest_token_hash: user ? null : `h-${id}`, link_id: null, score, is_official: true, created_at: `2026-10-0${id}`, ...extra })
  const base = {
    userId: 'me', exercises: [{ id: 1, title: 'Ex', courseTitle: 'C' }], myLinkIds: new Set(['L']),
    labels: new Map([['me', 'Me M.'], ['f1', 'Fran G.']]), activeMembers: new Set(['me', 'f1']),
  }

  it('ranks me against friends with deltas, guests as null, no hashes', () => {
    const [r] = buildStudentRetos({
      ...base,
      attempts: [at('1', 'f1', 90, { link_id: 'L' }), at('2', 'me', 70), at('3', null, 30, { link_id: 'L' }), at('4', 'me', 99, { is_official: false })],
    })
    expect(r).toMatchObject({ myScore: 70, myRank: 2, totalPlayers: 3, myPlays: 2, friendPlays: 2, createdLink: true })
    expect(r.leaderboard.map((e) => [e.label, e.delta])).toEqual([['Fran G.', -20], ['Me M.', null], [null, 40]])
    expect(r.joined).toEqual(['Fran G.', null])
    expect(JSON.stringify(r)).not.toMatch(/h-3|guest_token_hash|answer/)
  })

  it('non-active members show as guests; no official score → no rank/deltas', () => {
    const [r] = buildStudentRetos({ ...base, activeMembers: new Set(['me']), attempts: [at('1', 'f1', 90), at('2', 'me', 50, { is_official: false })] })
    expect(r.leaderboard[0].label).toBeNull()
    expect(r.myRank).toBeNull()
    expect(r.leaderboard[0].delta).toBeNull()
  })
})
