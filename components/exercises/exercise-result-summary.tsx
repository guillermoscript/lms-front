'use client'

import type { ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { cn } from '@/lib/utils'
import { EXERCISE_SURFACE, FeedbackList, ResultSection, ResultVerdict, RESULT_PROSE } from './result-parts'

interface ExerciseResultSummaryProps {
  score: number | null
  passed: boolean
  /** Absent for engines that record a completion but no AI feedback (code). */
  feedback?: string | null
  strengths?: string[]
  improvements?: string[]
  attemptNumber?: number | null
  completedAt?: string | null
  passingScore?: number
  /** A teacher's regrade: shown as the verdict, with the AI's score kept as a note. */
  teacherReview?: { score: number; passed: boolean; feedback: string | null } | null
  className?: string
  /** Engine-specific sections (corrections, transcript) inside the same
   * surface, so a result is one container rather than a stack of cards. */
  children?: ReactNode
}

/**
 * The student's last graded attempt on a standalone exercise, shown when they
 * come back to it. Previously every one of these engines held its result in
 * component state only, so returning to a finished exercise showed a bare
 * "Completed" badge and the feedback they had already earned was gone.
 */
export default function ExerciseResultSummary({
  score,
  passed,
  feedback,
  strengths = [],
  improvements = [],
  attemptNumber,
  completedAt,
  passingScore,
  teacherReview,
  className,
  children,
}: ExerciseResultSummaryProps) {
  const t = useTranslations('exercises.result')
  const tAudio = useTranslations('exercises.audio')
  const locale = useLocale()

  const meta = [
    typeof attemptNumber === 'number' ? tAudio('attempt', { number: attemptNumber }) : null,
    completedAt
      ? tAudio('completedOn', {
          date: new Date(completedAt).toLocaleDateString(locale, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          }),
        })
      : null,
  ].filter(Boolean)

  return (
    // A hairline card, not a tinted one: a fail used to flood the column beige
    // and a pass green, and the verdict inside already says which it was.
    <section className={cn(EXERCISE_SURFACE, 'space-y-5', className)} aria-label={t('title')}>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">{t('title')}</h3>
        <ResultVerdict
          score={teacherReview ? teacherReview.score : score}
          passed={teacherReview ? teacherReview.passed : passed}
          passingScore={passingScore}
          meta={meta}
        />
      </div>

      {teacherReview && (
        <ResultSection title={t('teacherReview')}>
          {teacherReview.feedback && (
            <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', RESULT_PROSE)}>{teacherReview.feedback}</p>
          )}
          {score !== null && <p className="text-xs text-muted-foreground">{t('aiScoreWas', { score: Math.round(score) })}</p>}
        </ResultSection>
      )}

      {feedback && (
        <ResultSection title={tAudio('aiFeedback')}>
          <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', RESULT_PROSE)}>{feedback}</p>
        </ResultSection>
      )}

      {(strengths.length > 0 || improvements.length > 0) && (
        <ResultSection className="space-y-5">
          <FeedbackList title={tAudio('strengths')} items={strengths} tone="strength" />
          <FeedbackList title={tAudio('improvements')} items={improvements} tone="improvement" />
        </ResultSection>
      )}

      {!feedback && strengths.length === 0 && improvements.length === 0 && (
        // Code challenges are graded by their test runner and store no feedback.
        // Say so, rather than leaving an unexplained empty card.
        <p className={cn('text-sm text-muted-foreground', RESULT_PROSE)}>{t('noFeedbackRecorded')}</p>
      )}

      {children}
    </section>
  )
}
