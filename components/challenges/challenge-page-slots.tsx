'use client'

import { useTranslations } from 'next-intl'

export interface ChallengeResultContext {
  token: string
  exerciseId: number
  guestScore: number
  guestPassed: boolean
  challengerScore: number | null
  challengerName: string | null
}

/**
 * SLOT (WS6, #1031): the duel result — guest vs challenger with the
 * "Empate técnico" tie band and the per-exercise ranking. The WS6 PR replaces
 * the body of this component with `<DuelResult … />` / `<Ranking … />`.
 * Until then it shows the plain comparison, with no tie logic.
 */
export function ChallengeDuelSlot({ ctx }: { ctx: ChallengeResultContext }) {
  const t = useTranslations('challenges.page')
  if (ctx.challengerScore === null) return null
  return (
    <p data-testid="challenge-duel-slot" className="text-sm text-muted-foreground">
      {t('duelBasic', { name: ctx.challengerName ?? t('guestName'), challenger: ctx.challengerScore, you: ctx.guestScore })}
    </p>
  )
}

/**
 * SLOT (WS4, #1029): the claim CTA — "sign in with Google to save your result
 * and join the ranking". The WS4 PR replaces this body with its component.
 * Renders nothing until then.
 */
export function ChallengeClaimSlot(_props: { ctx: ChallengeResultContext }) {
  return null
}
