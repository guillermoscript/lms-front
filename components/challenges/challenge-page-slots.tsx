'use client'

import { useTranslations } from 'next-intl'
import { DuelResult } from '@/components/challenges/duel-result'
import { ClaimCta } from '@/components/challenges/claim-cta'
import { Ranking } from '@/components/challenges/ranking'
import { ChallengeFriendsShare } from '@/components/challenges/challenge-friends-share'
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
  title?: string
  /** A Supabase session exists: offer "challenge your friends" instead of the Google claim. */
  viewerSignedIn?: boolean
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

/** The claim CTA: "continue with Google" to save the result and join the ranking. */
export function ChallengeClaimSlot({ ctx }: { ctx: ChallengeResultContext }) {
  if (ctx.viewerSignedIn) {
    return <ChallengeFriendsShare exerciseId={ctx.exerciseId} title={ctx.title ?? ''} />
  }
  return <ClaimCta token={ctx.token} />
}
