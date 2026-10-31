import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/messages/en.json'
import es from '@/messages/es.json'
import { memberChallengePath, publicChallengePath, shouldRedirectToDashboard } from '@/lib/challenges/routes'
import { classifyChallengePath } from '@/lib/challenges/proxy-guard'
import { rankingToRows, windowAround, type LeaderboardRow } from '@/lib/challenges/leaderboard'
import { createLinkCore } from '@/lib/challenges/links'
import { ChallengeLeaderboard } from '@/components/challenges/challenge-leaderboard'

const replace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/app/actions/challenge-links', () => ({ createBestAttemptChallengeLink: vi.fn(), createPlayChallengeLink: vi.fn() }))

function render(node: React.ReactElement) {
  const props = { locale: 'en', messages: en, children: node }
  return renderToStaticMarkup(createElement(NextIntlClientProvider, props))
}

describe('member route and redirect rules', () => {
  it('paths', () => {
    expect(memberChallengePath('abc123XY')).toBe('/dashboard/student/challenges/abc123XY')
    expect(publicChallengePath('abc123XY')).toBe('/reto/abc123XY')
  })
  it('active student is sent to the dashboard route', () => {
    expect(shouldRedirectToDashboard({ viewerIsMember: true, role: 'student', claiming: false })).toBe(true)
  })
  it('guests and non-members stay on the public page', () => {
    expect(shouldRedirectToDashboard({ viewerIsMember: false, role: 'student', claiming: false })).toBe(false)
    expect(shouldRedirectToDashboard({ viewerIsMember: false, role: null, claiming: false })).toBe(false)
  })
  it('?claim=1 is never redirected (the guest attempt is claimed there)', () => {
    expect(shouldRedirectToDashboard({ viewerIsMember: true, role: 'student', claiming: true })).toBe(false)
  })
  it('teachers and admins stay (proxy keeps them out of /dashboard/student)', () => {
    expect(shouldRedirectToDashboard({ viewerIsMember: true, role: 'teacher', claiming: false })).toBe(false)
    expect(shouldRedirectToDashboard({ viewerIsMember: true, role: 'admin', claiming: false })).toBe(false)
  })
  it('proxy guard still 404s dead public links and ignores the dashboard route', () => {
    expect(classifyChallengePath('/reto/bad')).toEqual({ kind: 'malformed' })
    expect(classifyChallengePath('/reto/abcdef12')).toEqual({ kind: 'token', token: 'abcdef12' })
    expect(classifyChallengePath('/dashboard/student/challenges/abcdef12')).toBeNull()
  })
})

describe('ChallengeLeaderboard consolidation', () => {
  const rows: LeaderboardRow[] = Array.from({ length: 20 }, (_, i) => ({ key: `u${i}`, label: `N${i}`, score: 100 - i, isMe: i === 10 }))

  it('windowed: viewer +-3, with a show-all toggle', () => {
    expect(windowAround(rows.map((r) => ({ ...r, isMe: Boolean(r.isMe) }))).map((r) => r.key)).toEqual(['u7', 'u8', 'u9', 'u10', 'u11', 'u12', 'u13'])
    const html = render(createElement(ChallengeLeaderboard, { rows, windowed: true }))
    expect(html).toContain('N10')
    expect(html).toContain('N7')
    expect(html).not.toContain('N6<')
    expect(html).not.toContain('N14<')
    expect(html).toContain('leaderboard-toggle')
    expect(html).toContain('Show all (20)')
  })
  it('not windowed renders every row and no toggle', () => {
    const html = render(createElement(ChallengeLeaderboard, { rows }))
    expect(html).toContain('N0<')
    expect(html).toContain('N19<')
    expect(html).not.toContain('leaderboard-toggle')
  })
  it('windowed without a viewer shows the top rows', () => {
    const html = render(createElement(ChallengeLeaderboard, { rows: rows.map((r) => ({ ...r, isMe: false })), windowed: true }))
    expect(html).toContain('N0<')
    expect(html).toContain('N6<')
    expect(html).not.toContain('N7<')
  })
  it('guest, nameless member, delta tokens (no palette colours)', () => {
    const html = render(
      createElement(ChallengeLeaderboard, {
        rows: [
          { key: 'a', label: null, score: 90, delta: 5 },
          { key: 'b', label: '', score: 80, delta: -5 },
          { key: 'c', label: 'Me', score: 85, isMe: true },
        ],
      }),
    )
    expect(html).toContain('Guest')
    expect(html).toContain('Student')
    expect(html).toContain('text-success')
    expect(html).toContain('text-destructive')
    expect(html).not.toMatch(/emerald|red-\d|amber/)
  })
  it('rankingToRows marks the viewer and keeps official ranks', () => {
    const r = rankingToRows([{ rank: 4, userId: 'me', displayName: 'Me', score: 70, passed: true, createdAt: 't' }], 'me')
    expect(r).toEqual([{ key: 'me', rank: 4, label: 'Me', score: 70, isMe: true }])
  })
  it('old leaderboard components are gone', async () => {
    const fs = await import('node:fs')
    for (const f of ['components/challenges/ranking.tsx', 'components/challenges/member-ranking.tsx', 'components/challenges/shared/reto-leaderboard.tsx']) {
      expect(fs.existsSync(f), f).toBe(false)
    }
  })
})

describe('i18n parity for the new keys', () => {
  it('en and es define the same challenge keys', () => {
    for (const path of [['shared', 'showAll'], ['shared', 'showNearby'], ['student', 'breadcrumbChallenge'], ['play', 'title'], ['play', 'cta'], ['play', 'error']]) {
      const get = (m: Record<string, unknown>) => path.reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], m.challenges)
      expect(typeof get(en), path.join('.')).toBe('string')
      expect(typeof get(es), path.join('.')).toBe('string')
    }
  })
})

// Minimal admin fake for createLinkCore: only the tables it touches.
function fakeAdmin(opts: { attempt: { id: string; exercise_id: number; score: number } | null }) {
  const inserted: Record<string, unknown>[] = []
  const exercise = { id: 5, course_id: 9, is_challengeable: true, exercise_type: 'essay' }
  const builder = (table: string) => {
    const state = { table }
    const q: Record<string, unknown> = {}
    const chain = () => q
    for (const m of ['select', 'eq', 'order', 'limit', 'is', 'not', 'in']) q[m] = chain
    q.maybeSingle = async () => {
      if (state.table === 'tenant_settings') return { data: { setting_value: true } }
      if (state.table === 'challenge_attempts') return { data: opts.attempt }
      if (state.table === 'exercises') return { data: exercise }
      if (state.table === 'courses') return { data: { author_id: 'someone-else', tenant_id: 't' } }
      return { data: null }
    }
    q.insert = (row: Record<string, unknown>) => {
      inserted.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'l1', token: row.token }, error: null }) }) }
    }
    return q
  }
  return { admin: { from: builder } as never, inserted }
}

describe('createLinkCore forPlay (play as a challenge)', () => {
  const deps = (admin: never) => ({ admin, hasAiGrading: async () => true })
  const student = { tenantId: 't', userId: 'u', role: 'student' as const }

  it('a student with no official attempt gets their own score-less open link', async () => {
    const { admin, inserted } = fakeAdmin({ attempt: null })
    const r = await createLinkCore(deps(admin), student, { exerciseId: 5, forPlay: true })
    expect(r.ok).toBe(true)
    expect(inserted[0]).toMatchObject({ tenant_id: 't', exercise_id: 5, created_by: 'u', owner_attempt_id: null })
    if (r.ok) expect(r.data.withScore).toBe(false)
  })
  it('without forPlay a student is still refused an open link', async () => {
    const { admin, inserted } = fakeAdmin({ attempt: null })
    const r = await createLinkCore(deps(admin), student, { exerciseId: 5, useBestAttempt: true })
    expect(r.ok).toBe(false)
    expect(inserted).toHaveLength(0)
  })
  it('with an official attempt, forPlay shares that attempt instead', async () => {
    const { admin, inserted } = fakeAdmin({ attempt: { id: 'a1', exercise_id: 5, score: 80 } })
    const r = await createLinkCore(deps(admin), student, { exerciseId: 5, forPlay: true })
    expect(r.ok).toBe(true)
    expect(inserted[0]).toMatchObject({ owner_attempt_id: 'a1' })
  })
})
