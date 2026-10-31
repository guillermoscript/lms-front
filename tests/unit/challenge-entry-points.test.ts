import { describe, expect, it } from 'vitest'
import { buildExerciseEntry, buildListBadges, isChallengeable, loadExerciseEntry, loadListBadges, windowAround, type OfficialAttempt } from '@/lib/challenges/entry'
import { withoutChallenges } from '@/lib/challenges/nav'
import { homeRetos } from '@/components/challenges/student-retos-card'
import type { StudentReto } from '@/lib/challenges/student'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

const att = (i: number, score: number, user = `u${i}`, ex = 1): OfficialAttempt =>
  ({ id: `a${i}`, exercise_id: ex, user_id: user, score, passed: score >= 70, created_at: `2026-01-${String(i + 1).padStart(2, '0')}` })

describe('windowAround', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ n: i, isMe: i === 10 }))
  it('shows viewer +-3', () => expect(windowAround(rows).map((r) => r.n)).toEqual([7, 8, 9, 10, 11, 12, 13]))
  it('slides at the top and bottom edges', () => {
    expect(windowAround(rows.map((r) => ({ ...r, isMe: r.n === 0 }))).map((r) => r.n)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(windowAround(rows.map((r) => ({ ...r, isMe: r.n === 19 }))).map((r) => r.n)).toEqual([13, 14, 15, 16, 17, 18, 19])
  })
})

describe('buildExerciseEntry', () => {
  it('is null without an official attempt of the viewer', () => {
    expect(buildExerciseEntry('me', [att(1, 90)], new Map())).toBeNull()
  })
  it('ranks by score desc then earliest, with rank and truncation', () => {
    const attempts = [att(1, 80), att(2, 95), att(3, 80, 'me'), ...Array.from({ length: 10 }, (_, i) => att(10 + i, 10 + i))]
    const e = buildExerciseEntry('me', attempts, new Map([['me', 'Yo']]))!
    expect(e.myRank).toBe(3)
    expect(e.total).toBe(13)
    expect(e.truncated).toBe(true)
    expect(e.rows.length).toBe(7)
    expect(e.rows.find((r) => r.isMe)?.label).toBe('Yo')
  })
})

describe('buildListBadges', () => {
  it('computes my best score/rank per exercise', () => {
    const m = buildListBadges('me', [att(1, 50, 'a', 1), att(2, 70, 'me', 1), att(3, 10, 'x', 2)])
    expect(m.get(1)).toEqual({ myScore: 70, myRank: 1, total: 2 })
    expect(m.get(2)).toEqual({ myScore: null, myRank: null, total: 1 })
  })
})

// A client that fails the test if it is queried: gating must short-circuit first.
const tripwire = new Proxy({}, { get: () => () => { throw new Error('queried') } }) as never
const settingsClient = (value: unknown) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'not', 'limit']) chain[m] = () => chain
    chain.maybeSingle = async () => ({ data: table === 'tenant_settings' ? { setting_value: value } : null })
    chain.then = (res: (v: unknown) => unknown) => res({ data: [], error: null })
    return chain
  },
}) as never

describe('gating', () => {
  const ex = { id: 1, exercise_type: 'essay', is_challengeable: true }
  it('isChallengeable needs flag and essay/discussion', () => {
    expect(isChallengeable(ex)).toBe(true)
    expect(isChallengeable({ ...ex, exercise_type: 'coding_challenge' })).toBe(false)
    expect(isChallengeable({ ...ex, is_challengeable: false })).toBe(false)
  })
  it('never queries for non-challengeable exercises', async () => {
    expect(await loadExerciseEntry(tripwire, 't', 'u', { ...ex, is_challengeable: false })).toBeNull()
    expect((await loadListBadges(tripwire, 't', 'u', [{ ...ex, exercise_type: 'audio_evaluation' }])).size).toBe(0)
  })
  it('hidden when the school has challenges off', async () => {
    expect(await loadExerciseEntry(settingsClient({ enabled: false }), 't', 'u', ex)).toBeNull()
    expect((await loadListBadges(settingsClient(undefined), 't', 'u', [ex])).size).toBe(0)
  })
  it('badge shows for an unplayed challengeable exercise when on', async () => {
    const m = await loadListBadges(settingsClient({ enabled: true }), 't', 'u', [ex])
    expect(m.get(1)).toEqual({ myScore: null, myRank: null, total: 0 })
  })
})

describe('withoutChallenges', () => {
  const items = [
    { href: '/dashboard/student' },
    { href: '/dashboard/student/challenges' },
    { href: '/dashboard/admin/courses', items: [{ href: '/dashboard/teacher/challenges' }, { href: '/dashboard/admin/categories' }] },
  ]
  it('keeps everything when on', () => expect(withoutChallenges(items, true)).toBe(items))
  it('drops top-level and nested Retos when off', () => {
    const out = withoutChallenges(items, false)
    expect(out.map((i) => i.href)).toEqual(['/dashboard/student', '/dashboard/admin/courses'])
    expect(out[1].items).toEqual([{ href: '/dashboard/admin/categories' }])
  })
})

describe('home card', () => {
  it('caps at 3', () => {
    const r = Array.from({ length: 5 }, (_, i) => ({ exerciseId: i }) as StudentReto)
    expect(homeRetos(r)).toHaveLength(3)
  })
})

describe('i18n parity', () => {
  const keys = (o: object) => Object.keys(o).sort()
  it('challenges.entry / challenges.student / exercises.list keys match in en and es', () => {
    expect(keys(es.challenges.entry)).toEqual(keys(en.challenges.entry))
    expect(keys(es.challenges.student)).toEqual(keys(en.challenges.student))
    expect(keys(es.exercises.list)).toEqual(keys(en.exercises.list))
  })
})
