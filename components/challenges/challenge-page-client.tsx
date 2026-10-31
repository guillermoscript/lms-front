'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Markdown from 'react-markdown'
import { IconAlertCircle, IconCircleCheck, IconCircleX, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'
import { Ranking } from './ranking'
import { ChallengeCourseCard } from './challenge-course-card'
import type { ChallengeCourse } from '@/lib/challenges/course-context'
import { ClaimResult } from './claim-result'
import { ChallengeShareButton } from './challenge-share-button'
import { ChallengeClaimSlot, ChallengeDuelSlot, type ChallengeResultContext } from './challenge-page-slots'

const MAX_CHARS = 8000

interface AttemptResult {
  score: number
  passed: boolean
  feedback: unknown
}

export interface ChallengePageClientProps {
  token: string
  exerciseId: number
  title: string
  instructions: string
  passingScore: number
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
  played?: { score: number; passed: boolean; answer: string; feedback: unknown; rank: number | null } | null
}

interface ParsedFeedback {
  feedback: string
  strengths: string[]
  improvements: string[]
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** Feedback arrives as a string or as `{ feedback, strengths, improvements }` (WS2 contract); any part may be empty. */
function parseFeedback(feedback: unknown): ParsedFeedback {
  if (typeof feedback === 'string') return { feedback, strengths: [], improvements: [] }
  if (feedback && typeof feedback === 'object') {
    const f = feedback as Record<string, unknown>
    return {
      feedback: typeof f.feedback === 'string' ? f.feedback : '',
      strengths: strings(f.strengths),
      improvements: strings(f.improvements),
    }
  }
  return { feedback: '', strengths: [], improvements: [] }
}

function PassedBadge({ passed }: { passed: boolean }) {
  const t = useTranslations('challenges.page')
  const Icon = passed ? IconCircleCheck : IconCircleX
  return (
    <span
      className={
        passed
          ? 'inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-xs font-medium text-success-foreground'
          : 'inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground'
      }
    >
      <Icon className="size-3.5" aria-hidden />
      {passed ? t('passed') : t('notPassed')}
    </span>
  )
}

export function ChallengePageClient(props: ChallengePageClientProps) {
  const { token, exerciseId, title, instructions, passingScore, challenger, creatorName, isOwner, viewerIsMember, rankingEntries, course, viewerId, played } = props
  const claiming = useSearchParams().get('claim') === '1'
  const t = useTranslations('challenges.page')
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fresh, setFresh] = useState<AttemptResult | null>(null)
  // Opening the link again shows the stored official attempt, not an empty form.
  const alreadyPlayed = !fresh && !claiming && played ? played : null
  const result: AttemptResult | null = fresh ?? (alreadyPlayed ? { score: alreadyPlayed.score, passed: alreadyPlayed.passed, feedback: alreadyPlayed.feedback } : null)

  const challengerName = challenger?.name ?? t('guestName')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/reto/attempt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ token, answer: answer.trim() }),
      })
      const body = await res.json().catch(() => null)
      if (res.status === 429) {
        setError(t('errorRateLimited'))
      } else if (res.status === 402 || res.status === 503) {
        setError(t('errorPaused'))
      } else if (res.status === 409) {
        setError(t('errorAlreadyPlayed'))
        router.refresh() // the server now finds the stored attempt and renders it
      } else if (!res.ok || typeof body?.score !== 'number') {
        setError(t('errorGeneric'))
      } else {
        setFresh({ score: body.score, passed: Boolean(body.passed), feedback: body.feedback })
      }
    } catch {
      setError(t('errorGeneric'))
    } finally {
      setPending(false)
    }
  }

  const fb = parseFeedback(result?.feedback)

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
      }
    : null

  const shareText = challenger
    ? t('shareText', { name: challengerName, score: challenger.score, exercise: title })
    : title

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 pb-10 pt-24 md:pb-14 md:pt-28">
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
            {!isOwner ? <p className="text-base">{t('beatIt')}</p> : null}
          </section>
        ) : (
          <>
            <p className="text-sm font-medium text-muted-foreground">{t('eyebrow')}</p>
            <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl" data-testid="open-challenge-heading">
              {creatorName ? t('openLine', { name: creatorName, exercise: title }) : t('openLineAnon', { exercise: title })}
            </h1>
            <p className="text-base">{t('beatIt')}</p>
          </>
        )}
      </header>

      {claiming ? <ClaimResult token={token} exerciseId={exerciseId} title={title} /> : null}

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
        <form onSubmit={submit} className="space-y-3" aria-busy={pending}>
          <label htmlFor="challenge-answer" className="text-sm font-semibold">{t('yourAnswer')}</label>
          <Textarea
            id="challenge-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={MAX_CHARS}
            rows={10}
            disabled={pending}
            placeholder={t('answerPlaceholder')}
            className="min-h-48"
          />
          <p className="text-xs text-muted-foreground">{t('coldNote')}</p>
          {error ? (
            <Alert variant="destructive" role="alert">
              <IconAlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={pending || !answer.trim()} data-testid="challenge-submit">
            {pending ? <IconLoader2 className="animate-spin" /> : null}
            {pending ? t('grading') : t('submit')}
          </Button>
        </form>
      ) : null}

      {!result && !claiming && rankingEntries ? (
        <Ranking entries={rankingEntries} currentUserId={viewerId ?? undefined} />
      ) : null}

      {result && ctx ? (
        <section aria-labelledby="result-heading" className="space-y-5" data-testid="challenge-result" aria-live="polite">
          {alreadyPlayed ? (
            <div role="status" data-testid="challenge-already-played" className="rounded-xl border border-border bg-muted/50 p-4">
              <p className="font-semibold">{t('alreadyPlayedTitle')}</p>
              <p className="text-sm text-muted-foreground">
                {alreadyPlayed.rank ? t('alreadyPlayedRank', { rank: alreadyPlayed.rank }) : t('alreadyPlayedBody')}
              </p>
            </div>
          ) : null}
          <h2 id="result-heading" className="sr-only">{t('resultHeading')}</h2>
          {/* Same result surface the dashboard exercise page uses. */}
          <div data-testid="challenge-score" className="sr-only">{result.score}</div>
          <ExerciseResultSummary
            score={result.score}
            passed={result.passed}
            feedback={fb.feedback}
            strengths={fb.strengths}
            improvements={fb.improvements}
            passingScore={passingScore}
          />
          {alreadyPlayed?.answer ? (
            <details className="rounded-xl border border-border p-4" data-testid="challenge-played-answer">
              <summary className="cursor-pointer text-sm font-semibold">{t('yourAnswerPlayed')}</summary>
              <p className="mt-3 max-w-[68ch] whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">{alreadyPlayed.answer}</p>
            </details>
          ) : null}
          {/* WS6 slot */}
          <ChallengeDuelSlot ctx={ctx} />
          {/* WS4 slot */}
          <ChallengeClaimSlot ctx={ctx} />
        </section>
      ) : null}
    </div>
  )
}
