import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/messages/en.json'

vi.mock('@/app/actions/challenge-links', () => ({ createBestAttemptChallengeLink: vi.fn() }))
vi.mock('@/app/actions/challenge-claim', () => ({ claimChallenge: vi.fn(() => new Promise(() => {})) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { ChallengeClaimSlot } from '@/components/challenges/challenge-page-slots'
import { ClaimResult } from '@/components/challenges/claim-result'

const render = (node: React.ReactElement) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'en', messages: en }, node))

const ctx = { token: 't', exerciseId: 5, guestScore: 66, guestPassed: false, challengerScore: null, challengerName: null, title: 'Ex' }

describe('ChallengeClaimSlot by viewer (#1047)', () => {
  it('guest: Google claim CTA, no share', () => {
    const html = render(createElement(ChallengeClaimSlot, { ctx }))
    expect(html).toContain('Continue with Google')
    expect(html).not.toContain('challenge-friends')
  })
  it('signed-in NON-member (viewerIsMember false): still gets the claim CTA', () => {
    const html = render(createElement(ChallengeClaimSlot, { ctx: { ...ctx, viewerIsMember: false } }))
    expect(html).toContain('Continue with Google')
    expect(html).not.toContain('challenge-friends')
  })
  it('active member: share action and NO Google button', () => {
    const html = render(createElement(ChallengeClaimSlot, { ctx: { ...ctx, viewerIsMember: true } }))
    expect(html).toContain('challenge-friends')
    expect(html).not.toContain('Continue with Google')
  })
})

describe('ClaimResult before the claim finishes', () => {
  it('shows the working state and no share action', () => {
    const html = render(createElement(ClaimResult, { token: 't', exerciseId: 5, title: 'Ex' }))
    expect(html).toContain('Saving your result')
    expect(html).not.toContain('challenge-friends')
  })
})
