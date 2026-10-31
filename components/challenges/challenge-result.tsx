'use client'

import { useTranslations } from 'next-intl'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'
import { ChallengeClaimSlot, ChallengeDuelSlot, type ChallengeResultContext } from './challenge-page-slots'
import type { AttemptResult } from './challenge-player'

interface ParsedFeedback {
  feedback: string
  strengths: string[]
  improvements: string[]
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []

/** Feedback arrives as a string or as `{ feedback, strengths, improvements }` (WS2 contract); any part may be empty. */
export function parseFeedback(feedback: unknown): ParsedFeedback {
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

export interface AlreadyPlayed {
  answer: string
  rank: number | null
}

/**
 * Result of the viewer's official attempt: the same summary the dashboard
 * exercise page uses, the duel/leaderboard and the claim or share action.
 * Mounted by both the public landing and the dashboard route.
 */
export function ChallengeResult({
  result,
  passingScore,
  ctx,
  alreadyPlayed,
}: {
  result: AttemptResult
  passingScore: number
  ctx: ChallengeResultContext
  alreadyPlayed: AlreadyPlayed | null
}) {
  const t = useTranslations('challenges.page')
  const fb = parseFeedback(result.feedback)
  return (
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
      <ChallengeDuelSlot ctx={ctx} />
      <ChallengeClaimSlot ctx={ctx} />
    </section>
  )
}
