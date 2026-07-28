'use client'

import { useTranslations, useLocale } from 'next-intl'
import { IconArrowNarrowRight, IconCheck, IconSparkles, IconTarget } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

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
  className?: string
}

/** Prose measure. The design law caps body text at 65-75ch; the card sits in a
 * `lg:col-span-8` column that is otherwise wide enough to run past 85ch. */
const PROSE = 'max-w-[68ch] break-words'

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
  className,
}: ExerciseResultSummaryProps) {
  const t = useTranslations('exercises.result')
  const tAudio = useTranslations('exercises.audio')
  const tArtifact = useTranslations('exercises.artifact')
  const locale = useLocale()

  const meta = [
    typeof attemptNumber === 'number' ? tAudio('attempt', { number: attemptNumber }) : null,
    typeof passingScore === 'number' ? t('passMark', { score: passingScore }) : null,
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
    <section
      className={cn(
        'rounded-xl border p-5 space-y-5',
        passed
          ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
          : 'border-amber-500/30 bg-amber-500/[0.04]',
        className
      )}
      aria-label={t('title')}
    >
      {/* Stacks below sm: at 390px the metadata line is squeezed to ~160px by
          the score block, which cannot shrink (the badge is whitespace-nowrap). */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            {passed ? (
              <IconCheck size={16} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
            ) : (
              <IconTarget size={16} className="text-amber-700 dark:text-amber-400 shrink-0" />
            )}
            {t('title')}
          </h3>
          {meta.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{meta.join(' · ')}</p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {score !== null && (
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  'text-2xl font-bold tabular-nums tracking-tight',
                  passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'
                )}
              >
                {Math.round(score)}
              </span>
              {/* Denominator is the scale, not the pass mark — every engine
                  clamps to 0-100, so "88 / 70" would read as 88 out of 70. */}
              <span className="text-sm font-medium text-muted-foreground">/ 100</span>
            </div>
          )}
          <Badge
            className={cn(
              'font-semibold px-2.5',
              passed
                ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950'
                : 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/40'
            )}
          >
            {passed ? tArtifact('passed') : tArtifact('failed')}
          </Badge>
        </div>
      </div>

      {feedback && (
        <div className="space-y-2">
          {/* The label is foreground, not `text-primary`: primary is overridden
              per tenant, so small text in it cannot be guaranteed to clear AA
              (the default hue measured 3.35:1 in dark). The icon keeps the
              accent — non-text UI only needs 3:1. */}
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <IconSparkles size={13} className="text-primary" aria-hidden="true" />
            {tAudio('aiFeedback')}
          </p>
          <p className={cn('text-sm leading-relaxed whitespace-pre-wrap', PROSE)}>{feedback}</p>
        </div>
      )}

      {strengths.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-2">
            {tAudio('strengths')}
          </p>
          <ul className="space-y-1.5">
            {strengths.map((item, i) => (
              <li key={i} className={cn('flex items-start gap-2 text-sm', PROSE)}>
                <IconCheck
                  size={14}
                  className="mt-1 shrink-0 text-emerald-700 dark:text-emerald-400"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {improvements.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
            {tAudio('improvements')}
          </p>
          <ul className="space-y-1.5">
            {improvements.map((item, i) => (
              // An arrow, not a minus: these are next steps, not deductions.
              <li key={i} className={cn('flex items-start gap-2 text-sm', PROSE)}>
                <IconArrowNarrowRight
                  size={14}
                  className="mt-1 shrink-0 text-amber-700 dark:text-amber-400"
                  aria-hidden="true"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!feedback && strengths.length === 0 && improvements.length === 0 && (
        // Code challenges are graded by their test runner and store no feedback.
        // Say so, rather than leaving an unexplained empty card.
        <p className={cn('text-sm text-muted-foreground', PROSE)}>{t('noFeedbackRecorded')}</p>
      )}
    </section>
  )
}
