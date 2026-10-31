'use client'

import { useTranslations } from 'next-intl'
import { DuelResult } from '@/components/challenges/duel-result'
import { ClaimCta } from '@/components/challenges/claim-cta'
import { ChallengeLeaderboard } from '@/components/challenges/challenge-leaderboard'
import { ChallengeFriendsShare } from '@/components/challenges/challenge-friends-share'
import { ChallengeCourseCard } from '@/components/challenges/challenge-course-card'
import { rankingToRows } from '@/lib/challenges/leaderboard'
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
  /** School name for the claim CTA copy ("join <school>"). */
  schoolName?: string | null
}

/** "You vs <friend>": guest/viewer vs challenger, with the tie band. Nothing when the link is open (no challenger score). */
export function ChallengeDuelSlot({ ctx }: { ctx: ChallengeResultContext }) {
  const t = useTranslations('challenges.page')
  if (ctx.challengerScore === null) return null
  return (
    <DuelResult
      mine={ctx.guestScore}
      theirs={ctx.challengerScore}
      theirName={ctx.challengerName ?? t('guestName')}
    />
  )
}

/** The per-exercise ranking. */
export function ChallengeRankingSlot({ ctx }: { ctx: ChallengeResultContext }) {
  if (!ctx.rankingEntries) return null
  return <ChallengeLeaderboard heading windowed={Boolean(ctx.viewerId)} rows={rankingToRows(ctx.rankingEntries, ctx.viewerId)} testId="challenge-ranking" />
}

/** The course the exercise belongs to, as an upsell. Always last. */
export function ChallengeUpsellSlot({ ctx }: { ctx: ChallengeResultContext }) {
  return ctx.course ? <ChallengeCourseCard course={ctx.course} variant="upsell" /> : null
}

/**
 * Conversion action: a guest or non-member saves the score (Google or email);
 * an active member challenges friends instead (it would sign them out otherwise).
 */
export function ChallengeClaimSlot({ ctx }: { ctx: ChallengeResultContext }) {
  return ctx.viewerIsMember ? <ChallengeFriendsShare exerciseId={ctx.exerciseId} title={ctx.title ?? ''} /> : <ClaimCta token={ctx.token} schoolName={ctx.schoolName} />
}
