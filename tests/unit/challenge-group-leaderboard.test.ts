import { describe, expect, it } from 'vitest'
import {
  buildChallengeTable,
  buildGroupLeaderboard,
  challengeWinners,
  type ChallengeTableAttempt,
  type GroupParticipant,
} from '@/lib/challenges/group-leaderboard'
import { TIE_BAND_POINTS } from '@/lib/challenges/ranking'

const P = (key: string, label: string | null, isMe = false): GroupParticipant => ({ key, label, isMe })
const S = (participantKey: string, exerciseId: number, score: number) => ({ participantKey, exerciseId, score })

describe('challengeWinners', () => {
  it('a single player never wins', () => {
    expect(challengeWinners([{ participantKey: 'a', score: 100 }])).toEqual([])
    expect(challengeWinners([])).toEqual([])
  })
  it('top score wins alone when the gap is at least the tie band', () => {
    const w = challengeWinners([
      { participantKey: 'a', score: 80 },
      { participantKey: 'b', score: 80 - TIE_BAND_POINTS },
    ])
    expect(w).toEqual(['a'])
  })
  it('players strictly inside the tie band share the win', () => {
    const w = challengeWinners([
      { participantKey: 'a', score: 80 },
      { participantKey: 'b', score: 80 - TIE_BAND_POINTS + 1 },
      { participantKey: 'c', score: 50 },
    ])
    expect(w.sort()).toEqual(['a', 'b'])
  })
})

describe('buildGroupLeaderboard', () => {
  it('rounds the average and counts played/won', () => {
    const rows = buildGroupLeaderboard(
      [P('a', 'Ana'), P('b', 'Beto')],
      [S('a', 1, 80), S('a', 2, 71), S('b', 1, 40)],
      [1, 2],
    )
    const a = rows.find((r) => r.key === 'a')!
    expect(a).toMatchObject({ average: 76, played: 2, won: 1, rank: 1 }) // 75.5 -> 76
    expect(rows.find((r) => r.key === 'b')).toMatchObject({ average: 40, played: 1, won: 0, rank: 2 })
  })

  it('a challenge with one player gives no win', () => {
    const rows = buildGroupLeaderboard([P('a', 'Ana'), P('b', 'Beto')], [S('a', 1, 90)], [1])
    expect(rows.find((r) => r.key === 'a')!.won).toBe(0)
  })

  it('tie band: both within the band win', () => {
    const rows = buildGroupLeaderboard([P('a', 'Ana'), P('b', 'Beto')], [S('a', 1, 90), S('b', 1, 88)], [1])
    expect(rows.map((r) => r.won)).toEqual([1, 1])
  })

  it('unplayed members are last and unranked', () => {
    const rows = buildGroupLeaderboard([P('z', 'Zoe'), P('a', 'Ana'), P('b', 'Beto')], [S('a', 1, 10), S('b', 1, 90)], [1])
    expect(rows.map((r) => r.key)).toEqual(['b', 'a', 'z'])
    expect(rows[2]).toMatchObject({ rank: null, average: null, played: 0 })
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)
  })

  it('shares rank on equal (average, wins, played) and skips the next number', () => {
    const rows = buildGroupLeaderboard(
      [P('a', 'Ana'), P('b', 'Beto'), P('c', 'Carla')],
      [S('a', 1, 90), S('b', 1, 90), S('c', 1, 10)],
      [1],
    )
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3])
  })

  it('ties on average are broken by wins then played, which changes the rank', () => {
    // a: avg 80 over 2 (won 0); b: avg 80 over 1 (won 0, single player on ex 2)
    const rows = buildGroupLeaderboard(
      [P('a', 'Ana'), P('b', 'Beto')],
      [S('a', 1, 80), S('a', 2, 80), S('b', 2, 80)],
      [1, 2],
    )
    // ex 2 is a tie between a and b (both win). a: won 1 played 2, b: won 1 played 1.
    expect(rows[0]).toMatchObject({ key: 'a', rank: 1 })
    expect(rows[1]).toMatchObject({ key: 'b', rank: 2 })
  })

  it('guests (label null) sort after named people on a full tie but are still ranked', () => {
    const rows = buildGroupLeaderboard(
      [P('guest:1', null), P('a', 'Ana')],
      [S('guest:1', 1, 70), S('a', 1, 70)],
      [1],
    )
    expect(rows.map((r) => r.key)).toEqual(['a', 'guest:1'])
    // genuine tie: same rank, the guest does not leapfrog nor get a worse rank number
    expect(rows.map((r) => r.rank)).toEqual([1, 1])
  })

  it('a guest with a lower average is never ranked above a named member', () => {
    const rows = buildGroupLeaderboard(
      [P('guest:1', null), P('a', 'Ana')],
      [S('guest:1', 1, 60), S('a', 1, 80)],
      [1],
    )
    expect(rows.map((r) => r.key)).toEqual(['a', 'guest:1'])
    expect(rows[1].label).toBeNull()
  })

  it('ignores exercises not in the list and unknown participants', () => {
    const rows = buildGroupLeaderboard(
      [P('a', 'Ana')],
      [S('a', 1, 50), S('a', 99, 100), S('ghost', 1, 100)],
      [1],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ average: 50, played: 1 })
  })

  it('duplicate scores for the same participant and exercise: the first wins', () => {
    const rows = buildGroupLeaderboard([P('a', 'Ana'), P('b', 'Beto')], [S('a', 1, 30), S('a', 1, 100), S('b', 1, 60)], [1])
    const a = rows.find((r) => r.key === 'a')!
    expect(a).toMatchObject({ average: 30, played: 1 })
    expect(rows.find((r) => r.key === 'b')!.won).toBe(1)
  })

  it('keeps isMe and empty groups work', () => {
    expect(buildGroupLeaderboard([], [], [])).toEqual([])
    const rows = buildGroupLeaderboard([P('a', 'Ana', true)], [], [1])
    expect(rows[0]).toMatchObject({ isMe: true, rank: null })
  })
})

describe('buildChallengeTable', () => {
  const att = (participantKey: string, score: number, criteria: { id: string; met: boolean }[] = []): ChallengeTableAttempt => ({
    participantKey,
    exerciseId: 1,
    score,
    criteria,
  })

  it('lists players best first, flags winners, finds myScore', () => {
    const t = buildChallengeTable(
      [P('a', 'Ana', true), P('b', 'Beto'), P('c', 'Carla')],
      [att('a', 70), att('b', 90), att('c', 89)],
      1,
    )
    expect(t.played.map((p) => p.key)).toEqual(['b', 'c', 'a'])
    expect(t.played.map((p) => p.won)).toEqual([true, true, false])
    expect(t.myScore).toBe(70)
    expect(t.pending).toEqual([])
  })

  it('pending = active members who have not played; guests are excluded', () => {
    const t = buildChallengeTable(
      [P('a', 'Ana', true), P('b', 'Beto'), P('guest:1', null), P('guest:2', null)],
      [att('a', 50), att('guest:1', 60)],
      1,
    )
    expect(t.pending.map((p) => p.key)).toEqual(['b'])
    // an unplayed guest never shows as pending
    expect(t.pending.some((p) => p.label === null)).toBe(false)
    expect(t.played.find((p) => p.key === 'guest:1')!.label).toBeNull()
  })

  it('ignores other exercises, unknown participants and duplicate attempts (first wins)', () => {
    const t = buildChallengeTable(
      [P('a', 'Ana', true)],
      [att('a', 40), att('a', 99), { ...att('a', 100), exerciseId: 2 }, att('ghost', 100)],
      1,
    )
    expect(t.played).toHaveLength(1)
    expect(t.myScore).toBe(40)
  })

  it('criteria are hidden when the viewer has not played', () => {
    const t = buildChallengeTable(
      [P('a', 'Ana', true), P('b', 'Beto')],
      [att('b', 80, [{ id: 'c1', met: true }])],
      1,
    )
    expect(t.myScore).toBeNull()
    expect(t.criteria).toEqual([])
  })

  it('criteria compare only people who played, null when a criterion is missing for someone', () => {
    const t = buildChallengeTable(
      [P('a', 'Ana', true), P('b', 'Beto'), P('c', 'Carla')],
      [att('a', 80, [{ id: 'c1', met: true }, { id: 'c2', met: false }]), att('b', 70, [{ id: 'c1', met: false }])],
      1,
    )
    expect(t.criteria.map((c) => c.id)).toEqual(['c1', 'c2'])
    const c1 = t.criteria[0].byParticipant
    expect(c1.map((p) => p.key)).toEqual(['a', 'b']) // Carla did not play
    expect(c1.map((p) => p.met)).toEqual([true, false])
    expect(t.criteria[1].byParticipant.map((p) => p.met)).toEqual([false, null])
  })

  it('never carries rubric description text (ids and met flags only)', () => {
    const dirty = [{ id: 'c1', met: true, description: 'SECRET RUBRIC TEXT', text: 'SECRET RUBRIC TEXT' }] as never
    const t = buildChallengeTable([P('a', 'Ana', true), P('b', 'Beto')], [att('a', 80, dirty), att('b', 70, dirty)], 1)
    const json = JSON.stringify(t)
    expect(json).not.toContain('SECRET RUBRIC TEXT')
    expect(json).not.toContain('description')
  })
})
