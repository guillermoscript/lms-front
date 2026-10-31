import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/messages/en.json'
import es from '@/messages/es.json'

vi.mock('@/app/actions/challenge-links', () => ({ createBestAttemptChallengeLink: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }) }))

import { buildChallengeOgCard, buildOgBars } from '@/lib/challenges/og-card'
import { displayName } from '@/lib/challenges/public-page'
import { ChallengeResult } from '@/components/challenges/challenge-result'

const SECRET_DESC = 'Mentions the Treaty of Westphalia explicitly'
const SECRET_ANSWER = 'My private answer about Westphalia'
const config = {
  rubric: { criteria: [{ id: 'a', description: SECRET_DESC, weight: 2 }, { id: 'b', description: 'Second hidden criterion text', weight: 1 }] },
  expected_keywords: ['westphalia'],
}
const feedback = {
  feedback: 'Great job on Westphalia',
  strengths: ['clear'],
  improvements: ['more'],
  criteria: [{ id: 'a', met: true }, { id: 'b', met: false }, { id: 'zzz', met: true }],
  answer: SECRET_ANSWER,
}

describe('buildOgBars', () => {
  it('one bar per rubric criterion with weight and verdict, ignoring unknown ids', () => {
    expect(buildOgBars(feedback, config)).toEqual([
      { met: true, weight: 2 },
      { met: false, weight: 1 },
    ])
  })
  it('malformed or missing verdicts yield no bars', () => {
    expect(buildOgBars(null, config)).toEqual([])
    expect(buildOgBars({ criteria: 'x' }, config)).toEqual([])
    expect(buildOgBars({ criteria: [{ id: 1, met: 'yes' }] }, config)).toEqual([])
  })
})

describe('buildChallengeOgCard (no answer leaks)', () => {
  const data = { challenger: { score: 87, passed: true, name: 'Guillermo M.', userId: 'u1' } }
  it('exposes only headline, score, passed and bars', () => {
    const card = buildChallengeOgCard(data, 'Guillermo M. scored 87', buildOgBars(feedback, config))
    expect(Object.keys(card).sort()).toEqual(['bars', 'headline', 'passed', 'score'])
    const json = JSON.stringify(card)
    for (const secret of [SECRET_DESC, SECRET_ANSWER, 'Westphalia', 'westphalia', 'Second hidden', '"id"']) {
      expect(json).not.toContain(secret)
    }
  })
  it('open link: no score, no bars', () => {
    const card = buildChallengeOgCard({ challenger: null }, 'X challenges you', [{ met: true, weight: 1 }])
    expect(card).toEqual({ headline: 'X challenges you', score: null, passed: null, bars: [] })
  })
})

describe('OG display name rules', () => {
  it('first name + initial; guests/empty become null (rendered as "Guest")', () => {
    expect(displayName('Ana Pérez López')).toBe('Ana L.')
    expect(displayName('Ana')).toBe('Ana')
    expect(displayName('')).toBeNull()
    expect(displayName(undefined)).toBeNull()
  })
})

const render = (node: React.ReactElement, messages: typeof en = en, locale = 'en') =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as React.ComponentType<Record<string, unknown>>, { locale, messages }, node))

const base = { token: 't', exerciseId: 5, guestScore: 80, guestPassed: true, challengerScore: 70, challengerName: 'Ana L.', title: 'Ex', schoolName: 'Code Academy' }
const result = { score: 80, passed: true, feedback: 'ok' }
const idx = (html: string, needle: string) => html.indexOf(needle)

describe('guest result ordering', () => {
  it('score -> duel -> save CTA -> ranking -> course upsell', () => {
    const html = render(
      createElement(ChallengeResult, {
        result,
        passingScore: 70,
        alreadyPlayed: null,
        ctx: {
          ...base,
          rankingEntries: [{ rank: 1, userId: 'x', displayName: 'Zed', score: 99, passed: true, createdAt: '2026-01-01' }],
          course: { id: 1, title: 'Course X', description: null, thumbnailUrl: null, priceLabel: null, isFree: true } as never,
        },
      }),
    )
    const score = idx(html, 'challenge-score')
    const duel = idx(html, 'You vs') >= 0 ? idx(html, 'You vs') : idx(html, 'Ana L.')
    const cta = idx(html, 'Save your score and join Code Academy')
    const ranking = idx(html, 'challenge-ranking')
    expect(score).toBeGreaterThan(-1)
    expect(duel).toBeGreaterThan(score)
    expect(cta).toBeGreaterThan(duel)
    expect(ranking === -1 || ranking > cta).toBe(true)
    expect(html).not.toContain('challenge-friends')
    expect(html).toContain('Sign up with email')
    expect(html).toContain('next=%2Freto%2Ft%3Fclaim%3D1')
  })

  it('member: share sits above the duel, no claim CTA', () => {
    const html = render(createElement(ChallengeResult, { result, passingScore: 70, alreadyPlayed: null, ctx: { ...base, viewerIsMember: true } }))
    expect(idx(html, 'challenge-friends')).toBeGreaterThan(-1)
    expect(idx(html, 'challenge-friends')).toBeLessThan(idx(html, 'Ana L.'))
    expect(html).not.toContain('Continue with Google')
  })

  it('Spanish copy exists for every new guest key', () => {
    expect(Object.keys(es.challenges.guest).sort()).toEqual(Object.keys(en.challenges.guest).sort())
  })
})
