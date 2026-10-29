import { describe, expect, it, vi } from 'vitest'
import {
  compareDuel,
  fetchChallengeRanking,
  formatDisplayName,
  sortRanking,
} from '@/lib/challenges/ranking'

describe('compareDuel tie band', () => {
  it('diff 2 is a tie', () => {
    expect(compareDuel(87, 85)).toEqual({ outcome: 'tie', diff: 2 })
    expect(compareDuel(85, 87)).toEqual({ outcome: 'tie', diff: 2 })
  })
  it('diff 3 is a win', () => {
    expect(compareDuel(88, 85)).toEqual({ outcome: 'mine', diff: 3 })
    expect(compareDuel(85, 88)).toEqual({ outcome: 'theirs', diff: 3 })
  })
  it('diff 4 is a win', () => {
    expect(compareDuel(89, 85).outcome).toBe('mine')
    expect(compareDuel(85, 89).outcome).toBe('theirs')
  })
  it('equal scores tie', () => {
    expect(compareDuel(70, 70).outcome).toBe('tie')
  })
})

describe('formatDisplayName', () => {
  it('first name + last initial', () => {
    expect(formatDisplayName('Ana Pérez López')).toBe('Ana L.')
    expect(formatDisplayName('  guille   marin ')).toBe('guille M.')
  })
  it('single name and empty', () => {
    expect(formatDisplayName('Ana')).toBe('Ana')
    expect(formatDisplayName(null)).toBe('Estudiante')
  })
})

describe('sortRanking', () => {
  it('score desc then earliest, ranks renumbered', () => {
    const r = sortRanking([
      { userId: 'a', displayName: 'A', score: 80, passed: true, createdAt: '2026-01-02T00:00:00Z' },
      { userId: 'b', displayName: 'B', score: 90, passed: true, createdAt: '2026-01-05T00:00:00Z' },
      { userId: 'c', displayName: 'C', score: 80, passed: true, createdAt: '2026-01-01T00:00:00Z' },
    ])
    expect(r.map((e) => [e.userId, e.rank])).toEqual([['b', 1], ['c', 2], ['a', 3]])
  })
})

describe('fetchChallengeRanking', () => {
  const row = (user_id: string, score: number, created_at: string) => ({
    user_id, display_name: user_id, score, passed: true, created_at, rank: 0,
  })

  it('calls the tenant-scoped RPC with only the exercise id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    await fetchChallengeRanking({ rpc } as never, 42)
    expect(rpc).toHaveBeenCalledWith('get_challenge_ranking', { _exercise_id: 42 })
  })

  it("never surfaces another tenant's attempts (RPC scopes by caller's membership)", async () => {
    // Fake RPC with the same contract as the SQL: rows of the caller's tenant only.
    const attempts = [
      { tenant: 't1', ...row('mine-tenant', 70, '2026-01-01T00:00:00Z') },
      { tenant: 't2', ...row('other-tenant', 99, '2026-01-01T00:00:00Z') },
    ]
    const rpc = vi.fn(async () => ({
      data: attempts.filter((a) => a.tenant === 't1'),
      error: null,
    }))
    const out = await fetchChallengeRanking({ rpc } as never, 1)
    expect(out.map((e) => e.userId)).toEqual(['mine-tenant'])
  })

  it('throws on RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(fetchChallengeRanking({ rpc } as never, 1)).rejects.toThrow('boom')
  })
})
