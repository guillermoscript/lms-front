import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import {
  compareDuel,
  fetchChallengeRanking,
  formatDisplayName,
  type RankingEntry,
} from '@/lib/challenges/ranking'
import { getChallengeRankingServer } from '@/lib/challenges/ranking-server'
import { Ranking } from '@/components/challenges/ranking'
import { DuelResult } from '@/components/challenges/duel-result'
import en from '@/messages/en.json'

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
  it('one word, empty, null -> no invented fallback', () => {
    expect(formatDisplayName('Ana')).toBe('Ana')
    expect(formatDisplayName('')).toBe('')
    expect(formatDisplayName(null)).toBe('')
  })
  it('emoji initial is not split into surrogate halves', () => {
    expect(formatDisplayName('Ana 😀smith')).toBe('Ana 😀.')
  })
  it('very long names are kept whole (UI truncates)', () => {
    const long = 'x'.repeat(300)
    expect(formatDisplayName(`${long} ${long}`)).toBe(`${long} X.`)
  })
})

describe('fetchChallengeRanking', () => {
  it('calls the RPC with only the exercise id and keeps DB order/ranks', async () => {
    const t = '2026-01-01T00:00:00Z' // identical timestamps: order is the DB's
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { rank: 1, user_id: 'b', display_name: 'B', score: 80, passed: true, created_at: t },
        { rank: 2, user_id: 'a', display_name: 'A', score: 80, passed: true, created_at: t },
      ],
      error: null,
    })
    const out = await fetchChallengeRanking({ rpc } as never, 42)
    expect(rpc).toHaveBeenCalledWith('get_challenge_ranking', { _exercise_id: 42 })
    expect(out.map((e) => [e.userId, e.rank])).toEqual([['b', 1], ['a', 2]])
  })
  it('throws on RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(fetchChallengeRanking({ rpc } as never, 1)).rejects.toThrow('boom')
  })
})

function fakeAdmin(tables: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const from = (table: string) => {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'order', 'in']) {
      b[m] = (...args: unknown[]) => {
        calls.push({ table, method: m, args })
        return b
      }
    }
    // Deliberately NO filtering: returns every row so only the query shape protects tenancy.
    b.then = (res: (v: unknown) => unknown) => res({ data: tables[table], error: null })
    return b
  }
  return { admin: { from } as never, calls }
}

describe('getChallengeRankingServer', () => {
  it('scopes the query by tenant, exercise, official and claimed; orders with id tiebreak', async () => {
    const { admin, calls } = fakeAdmin({ challenge_attempts: [], profiles: [], tenant_users: [] })
    await getChallengeRankingServer('tenant-1', 7, admin)
    const q = calls.filter((c) => c.table === 'challenge_attempts')
    expect(q).toContainEqual({ table: 'challenge_attempts', method: 'eq', args: ['tenant_id', 'tenant-1'] })
    expect(q).toContainEqual({ table: 'challenge_attempts', method: 'eq', args: ['exercise_id', 7] })
    expect(q).toContainEqual({ table: 'challenge_attempts', method: 'eq', args: ['is_official', true] })
    expect(q).toContainEqual({ table: 'challenge_attempts', method: 'not', args: ['user_id', 'is', null] })
    expect(q.filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['score', 'created_at', 'id'])
  })

  it('selects no email and maps names + sequential ranks without re-sorting', async () => {
    const { admin, calls } = fakeAdmin({
      challenge_attempts: [
        { id: '1', user_id: 'u1', score: 90, passed: true, created_at: 't' },
        { id: '2', user_id: 'u2', score: 90, passed: true, created_at: 't' },
        { id: '3', user_id: 'u3', score: 50, passed: false, created_at: 't' },
      ],
      profiles: [
        { id: 'u1', full_name: 'Ana Pérez' },
        { id: 'u2', full_name: null },
      ],
      tenant_users: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }],
    })
    const out = await getChallengeRankingServer('t', 1, admin)
    expect(out.map((e) => [e.userId, e.rank, e.displayName])).toEqual([
      ['u1', 1, 'Ana P.'],
      ['u2', 2, ''],
      ['u3', 3, ''],
    ])
    const selects = calls.filter((c) => c.method === 'select').map((c) => String(c.args[0]))
    expect(selects.join(',')).not.toMatch(/email/)
  })

  it('only ACTIVE members of the tenant rank; non-members and banned are dropped, ranks stay sequential', async () => {
    const { admin, calls } = fakeAdmin({
      challenge_attempts: [
        { id: '1', user_id: 'outsider', score: 99, passed: true, created_at: 't' },
        { id: '2', user_id: 'u1', score: 90, passed: true, created_at: 't' },
        { id: '3', user_id: 'banned', score: 80, passed: true, created_at: 't' },
        { id: '4', user_id: 'u2', score: 70, passed: true, created_at: 't' },
      ],
      profiles: [{ id: 'u1', full_name: 'Ana Pérez' }],
      // The DB applies the active filter; the fake returns what such a query would.
      tenant_users: [{ user_id: 'u1' }, { user_id: 'u2' }],
    })
    const out = await getChallengeRankingServer('t', 1, admin)
    expect(out.map((e) => [e.userId, e.rank])).toEqual([['u1', 1], ['u2', 2]])
    const tu = calls.filter((c) => c.table === 'tenant_users')
    expect(tu).toContainEqual({ table: 'tenant_users', method: 'eq', args: ['tenant_id', 't'] })
    expect(tu).toContainEqual({ table: 'tenant_users', method: 'eq', args: ['status', 'active'] })
  })

  it('returns nothing when no attempt belongs to an active member', async () => {
    const { admin } = fakeAdmin({
      challenge_attempts: [{ id: '1', user_id: 'outsider', score: 99, passed: true, created_at: 't' }],
      profiles: [],
      tenant_users: [],
    })
    expect(await getChallengeRankingServer('t', 1, admin)).toEqual([])
  })
})

function render(node: React.ReactElement) {
  const props = { locale: 'en', messages: en, timeZone: 'UTC', children: node }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}
const entry = (o: Partial<RankingEntry>): RankingEntry => ({
  rank: 1, userId: 'u', displayName: 'Ana P.', score: 90, passed: true, createdAt: 't', ...o,
})

describe('Ranking component', () => {
  it('loading', () => {
    expect(render(createElement(Ranking, { entries: [], status: 'loading' }))).toContain('role="status"')
  })
  it('empty', () => {
    expect(render(createElement(Ranking, { entries: [] }))).toContain(en.challenges.ranking.empty)
  })
  it('error with retry', () => {
    const html = render(createElement(Ranking, { entries: [], status: 'error', onRetry: () => {} }))
    expect(html).toContain('role="alert"')
    expect(html).toContain(en.challenges.ranking.retry)
  })
  it('table with headers, you label, fallback name, DB order kept', () => {
    const html = render(
      createElement(Ranking, {
        currentUserId: 'me',
        entries: [
          entry({ userId: 'x', displayName: 'Zed', score: 10, rank: 1 }),
          entry({ userId: 'me', displayName: '', score: 99, rank: 2 }),
        ],
      }),
    )
    expect(html).toContain('<th scope="col">Rank</th>')
    expect(html).toContain(en.challenges.ranking.anonymous)
    expect(html).toContain(en.challenges.ranking.you)
    expect(html).not.toContain('aria-current')
    expect(html.indexOf('Zed')).toBeLessThan(html.indexOf(en.challenges.ranking.anonymous))
  })
})

describe('DuelResult component', () => {
  it('tie hint uses the band constant', () => {
    const html = render(createElement(DuelResult, { mine: 87, theirs: 85, theirName: 'Ana P.' }))
    expect(html).toContain('Technical tie')
    expect(html).toContain('Less than 3 points apart.')
  })
})
