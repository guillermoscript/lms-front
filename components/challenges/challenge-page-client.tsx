'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconCircleCheck, IconCircleX } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChallengeLeaderboard } from './challenge-leaderboard'
import { ChallengeCourseCard } from './challenge-course-card'
import type { ChallengeCourse } from '@/lib/challenges/course-context'
import { rankingToRows } from '@/lib/challenges/leaderboard'
import { ClaimResult } from './claim-result'
import { ChallengeShareButton } from './challenge-share-button'
import { ChallengePlayer, type AttemptResult } from './challenge-player'
import { ChallengeVoicePlayer } from './challenge-voice-player'
import { ChallengeVoiceGate } from './challenge-voice-gate'
import { isVoiceChallengeType } from '@/lib/challenges/types'
import { ChallengeResult } from './challenge-result'
import type { ChallengeResultContext } from './challenge-page-slots'
import { cn } from '@/lib/utils'

export interface ChallengePageClientProps {
  /** `public`: the lightweight landing (clears the fixed navbar, runs `?claim=1`). `member`: inside the dashboard shell. */
  variant?: 'public' | 'member'
  /** Member route only: the viewer just claimed their guest result (`?claimed=1`). */
  claimed?: boolean
  /** Free course only: the exercise to continue with after a claim. */
  claimedNext?: { courseId: number; exerciseId: number } | null
  token: string
  exerciseId: number
  title: string
  instructions: string
  passingScore: number
  /** `exercises.exercise_type`; a voice reto swaps the text form for a live call. */
  exerciseType?: string
  /** Voice retos: the call's time budget. */
  maxMinutes?: number | null
  challenger: { score: number; passed: boolean; name: string | null } | null
  /** Creator of an OPEN link (no challenger score); `null` when unknown. */
  creatorName?: string | null
  /** The signed-in viewer is the challenger: show the card and share, not the form. */
  isOwner: boolean
  /** Active member of this school: gets "challenge your friends" instead of the Google claim. */
  viewerIsMember?: boolean
  /** Per-exercise ranking, supplied by the page once WS6's server helper is wired in. */
  rankingEntries?: ChallengeResultContext['rankingEntries']
  /** Published course the exercise belongs to (context block + upsell). */
  course?: ChallengeCourse | null
  viewerId?: string | null
  /** The viewer's own official attempt, when they already played (member or guest cookie). */
  /** School name for the guest CTA copy. */
  schoolName?: string | null
  played?: { score: number; passed: boolean; answer: string; feedback: unknown; rank: number | null } | null
}

function PassedBadge({ passed }: { passed: boolean }) {
  const t = useTranslations('challenges.page')
  const Icon = passed ? IconCircleCheck : IconCircleX
  return (
    <Badge variant={passed ? 'default' : 'secondary'} className="h-6 px-2.5 text-xs [&>svg]:size-3.5!">
      <Icon aria-hidden />
      {passed ? t('passed') : t('notPassed')}
    </Badge>
  )
}

function ClaimedNotice({ score, next }: { score: number | null; next: ChallengePageClientProps['claimedNext'] }) {
  const t = useTranslations('challenges.claim')
  return (
    <div role="status" data-testid="challenge-claimed" className="space-y-2 rounded-xl border border-border bg-muted/50 p-4">
      <p className="font-semibold">{t('savedTitle')}</p>
      {score !== null ? <p className="text-sm text-muted-foreground">{t('savedScore', { score })}</p> : null}
      {next ? (
        <Button render={<Link href={`/dashboard/student/courses/${next.courseId}/exercises/${next.exerciseId}`} />} variant="outline" size="sm">
          {t('nextExercise')}
        </Button>
      ) : null}
    </div>
  )
}

export function ChallengePageClient(props: ChallengePageClientProps) {
  const { variant = 'public', claimed, claimedNext, token, exerciseId, title, instructions, passingScore, exerciseType, maxMinutes, challenger, creatorName, isOwner, viewerIsMember, rankingEntries, course, viewerId, played, schoolName } = props
  const member = variant === 'member'
  // The claim only runs on the public landing; the member route is where it ends up.
  const claiming = useSearchParams().get('claim') === '1' && !member
  const t = useTranslations('challenges.page')
  const router = useRouter()
  const [fresh, setFresh] = useState<AttemptResult | null>(null)
  // Opening the link again shows the stored official attempt, not an empty form.
  const alreadyPlayed = !fresh && !claiming && played ? played : null
  const result: AttemptResult | null = fresh ?? (alreadyPlayed ? { score: alreadyPlayed.score, passed: alreadyPlayed.passed, feedback: alreadyPlayed.feedback } : null)

  const onPlayed = (r: AttemptResult) => {
    setFresh(r)
    // Inside the shell the ranking and the stored attempt are server data: refetch them.
    if (member) router.refresh()
  }

  const challengerName = challenger?.name ?? t('guestName')

  const ctx: ChallengeResultContext | null = result
    ? {
        token,
        exerciseId,
        guestScore: result.score,
        guestPassed: result.passed,
        challengerScore: challenger?.score ?? null,
        challengerName: challenger?.name ?? null,
        rankingEntries,
        title,
        // On ?claim=1 `ClaimResult` already offers the share action.
        viewerIsMember: viewerIsMember && !claiming,
        course,
        viewerId,
        schoolName,
      }
    : null

  const shareText = challenger
    ? t('shareText', { name: challengerName, score: challenger.score, exercise: title })
    : title

  return (
    <div className={cn('mx-auto w-full max-w-3xl space-y-8', member ? '' : 'px-4 pb-10 pt-24 md:pb-14 md:pt-28')}>
      <header className="space-y-3">
        {challenger ? (
          <section aria-labelledby="challenger-heading" className="space-y-2" data-testid="challenger-card">
            <p className="text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
            <h1 id="challenger-heading" className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              {t('challengerLine', { name: challengerName, score: challenger.score, exercise: title })}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl font-semibold tabular-nums">{challenger.score}</span>
              <PassedBadge passed={challenger.passed} />
              <span className="text-sm text-muted-foreground">{t('passingScore', { score: passingScore })}</span>
            </div>
            {!isOwner ? <p className="text-base">{t(isVoiceChallengeType(exerciseType) ? 'voiceBeatIt' : 'beatIt')}</p> : null}
          </section>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl" data-testid="open-challenge-heading">
              {creatorName ? t('openLine', { name: creatorName, exercise: title }) : t('openLineAnon', { exercise: title })}
            </h1>
            <p className="text-base">{t(isVoiceChallengeType(exerciseType) ? 'voiceBeatIt' : 'beatIt')}</p>
          </>
        )}
      </header>

      {claiming ? <ClaimResult token={token} exerciseId={exerciseId} title={title} /> : null}
      {member && claimed && played ? <ClaimedNotice score={played.score} next={claimedNext} /> : null}

      {isOwner ? (
        <section className="space-y-3" aria-labelledby="share-heading">
          <h2 id="share-heading" className="text-lg font-semibold">{t('shareHeading')}</h2>
          <p className="text-sm text-muted-foreground">{t('shareBody')}</p>
          <ChallengeShareButton title={title} text={shareText} />
        </section>
      ) : null}

      {course ? <ChallengeCourseCard course={course} variant="context" /> : null}

      <section aria-labelledby="instructions-heading" className="space-y-2">
        <h2 id="instructions-heading" className="text-sm font-semibold">{t('instructions')}</h2>
        <div className="prose prose-neutral max-w-[68ch] dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/85 prose-headings:text-base">
          <Markdown>{instructions}</Markdown>
        </div>
      </section>

      {!isOwner && !result && !claiming ? (
        isVoiceChallengeType(exerciseType) ? (
          // Voice retos are members-only (they bill realtime minutes to the school): guests sign up first.
          viewerIsMember ? (
            <ChallengeVoicePlayer token={token} maxMinutes={maxMinutes ?? 5} onResult={onPlayed} />
          ) : (
            <ChallengeVoiceGate token={token} schoolName={schoolName} />
          )
        ) : (
          <ChallengePlayer token={token} onResult={onPlayed} />
        )
      ) : null}

      {!result && !claiming && rankingEntries ? (
        <ChallengeLeaderboard heading windowed={Boolean(viewerId)} rows={rankingToRows(rankingEntries, viewerId)} testId="challenge-ranking" />
      ) : null}

      {result && ctx ? <ChallengeResult result={result} passingScore={passingScore} ctx={ctx} alreadyPlayed={alreadyPlayed} /> : null}
    </div>
  )
}
