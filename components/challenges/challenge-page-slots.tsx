'use client'

import { useTranslations } from 'next-intl'
import { DuelResult } from '@/components/challenges/duel-result'
import { ClaimCta } from '@/components/challenges/claim-cta'
import { Ranking } from '@/components/challenges/ranking'
import { ChallengeFriendsShare } from '@/components/challenges/challenge-friends-share'
import { ChallengeCourseCard } from '@/components/challenges/challenge-course-card'
import type { RankingEntry } from '@/lib/challenges/ranking'
import type { ChallengeCourse } from '@/lib/challenges/course-context'

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
  /** Active member: "challenge your friends", no Google claim (it would sign them out). */
  viewerIsMember?: boolean
  /** Course this exercise belongs to: powers the upsell card. */
  course?: ChallengeCourse | null
  viewerId?: string | null
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
      {ctx.rankingEntries ? <Ranking entries={ctx.rankingEntries} currentUserId={ctx.viewerId ?? undefined} /> : null}
    </div>
  )
}

/** The claim CTA: "continue with Google" to save the result and join the ranking. */
export function ChallengeClaimSlot({ ctx }: { ctx: ChallengeResultContext }) {
  return (
    <div className="space-y-5">
      {ctx.course ? <ChallengeCourseCard course={ctx.course} variant="upsell" /> : null}
      {ctx.viewerIsMember ? <ChallengeFriendsShare exerciseId={ctx.exerciseId} title={ctx.title ?? ''} /> : <ClaimCta token={ctx.token} />}
    </div>
  )
}
