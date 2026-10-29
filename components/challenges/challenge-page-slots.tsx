'use client'

import { useTranslations } from 'next-intl'
import { DuelResult } from '@/components/challenges/duel-result'
import { Ranking } from '@/components/challenges/ranking'
import type { RankingEntry } from '@/lib/challenges/ranking'

export interface ChallengeResultContext {
  token: string
  exerciseId: number
  guestScore: number
  guestPassed: boolean
  challengerScore: number | null
  challengerName: string | null
  /** Ranking rows from WS6's `getChallengeRankingServer`; absent until wired. */
  rankingEntries?: RankingEntry[]
}

/** The duel result (guest vs challenger, with the tie band) and the per-exercise ranking. */
export function ChallengeDuelSlot({ ctx }: { ctx: ChallengeResultContext }) {
  const t = useTranslations('challenges.page')
  return (
    <div className="space-y-5">
      {ctx.challengerScore !== null ? (
        <DuelResult
          mine={ctx.guestScore}
          theirs={ctx.challengerScore}
          theirName={ctx.challengerName ?? t('guestName')}
        />
      ) : null}
      {ctx.rankingEntries ? <Ranking entries={ctx.rankingEntries} /> : null}
    </div>
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
