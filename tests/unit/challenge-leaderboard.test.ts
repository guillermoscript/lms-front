import { describe, expect, it } from 'vitest'
import { trimLeaderboard } from '@/lib/challenges/leaderboard'
import type { RankingEntry } from '@/lib/challenges/ranking'

const rows = (n: number): RankingEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    rank: i + 1,
    userId: `u${i + 1}`,
    displayName: `User ${i + 1}`,
    score: 100 - i,
    passed: true,
    createdAt: '2026-10-01T00:00:00Z',
  }))

describe('trimLeaderboard', () => {
  it('keeps everything when under the cut', () => expect(trimLeaderboard(rows(4), 'u2')).toHaveLength(4))
  it('cuts to top N for guests / unranked viewers', () => {
    expect(trimLeaderboard(rows(25), null)).toHaveLength(10)
    expect(trimLeaderboard(rows(25), 'nobody')).toHaveLength(10)
  })
  it('appends the viewer row, with its official rank, when below the cut', () => {
    const out = trimLeaderboard(rows(25), 'u17')
    expect(out).toHaveLength(11)
    expect(out.at(-1)).toMatchObject({ userId: 'u17', rank: 17 })
  })
  it('does not duplicate a viewer already in the top', () => {
    expect(trimLeaderboard(rows(25), 'u3')).toHaveLength(10)
  })
})
