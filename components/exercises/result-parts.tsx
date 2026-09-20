'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { IconArrowNarrowRight, IconCheck, IconTarget } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

/** Prose measure. Body text is capped at 65-75ch; the result column is wide
 * enough to run past 85ch. */
export const RESULT_PROSE = 'max-w-[68ch] break-words'

/** The exercise page's one container: `Card`'s hairline at learner padding.
 * Never nested — sections inside it are split by `ResultSection` hairlines. */
export const EXERCISE_SURFACE = 'rounded-card bg-card ring-1 ring-foreground/10 p-5 sm:p-6'

interface ResultVerdictProps {
  /** Absent for engines that record a completion without a grade (code). */
  score: number | null
  passed: boolean
  passingScore?: number
  /** Attempt number, dates — joined into one quiet line under the score. */
  meta?: (string | null | undefined | false)[]
  className?: string
}

/**
 * The one place a grade is stated. Every engine used to say it three or four
 * times over — a tinted banner, a ring, a badge, a "best score" card — and the
 * copies disagreed (a passing 75 drew an amber ring).
 *
 * Learner register: the number is type, not a gauge. The bar exists only to
 * place the score against the pass mark, which a bare number cannot do.
 */
export function ResultVerdict({ score, passed, passingScore, meta = [], className }: ResultVerdictProps) {
  const t = useTranslations('exercises.result')
  const tArtifact = useTranslations('exercises.artifact')
  const tAudio = useTranslations('exercises.audio')

  const rounded = score === null ? null : Math.round(score)
  const pointsAway =
    !passed && rounded !== null && typeof passingScore === 'number'
      ? Math.max(0, passingScore - rounded)
      : 0

  const line = [
    typeof passingScore === 'number' ? t('passMark', { score: passingScore }) : null,
    ...meta,
  ].filter(Boolean)

  return (
    <div className={cn('space-y-3', className)}>
      {/* Icon + word, never color alone: tenants override the palette. */}
      <p
        className={cn(
          'flex items-center gap-1.5 text-sm font-semibold',
          passed ? 'text-success' : 'text-warning'
        )}
      >
        {passed ? (
          <IconCheck size={16} aria-hidden="true" />
        ) : (
          <IconTarget size={16} aria-hidden="true" />
        )}
        {passed ? tArtifact('passed') : tArtifact('failed')}
        {pointsAway > 0 && (
          <span className="font-normal text-muted-foreground">
            · {tAudio('pointsAway', { points: pointsAway })}
          </span>
        )}
      </p>

      {rounded !== null && (
        <div className="max-w-sm space-y-2">
          {/* Out of 100, not out of the pass mark: "64 / 70" reads as 91%
              when 64 is a failure. */}
          <p className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums tracking-tight">{rounded}</span>
            <span className="text-base text-muted-foreground tabular-nums">/ 100</span>
          </p>

          {typeof passingScore === 'number' && (
            // Decorative: the score and the pass mark are both in text.
            <div className="relative h-1.5 rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn('h-full rounded-full', passed ? 'bg-success' : 'bg-warning')}
                style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }}
              />
              <div
                className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground"
                style={{ left: `${Math.min(100, Math.max(0, passingScore))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {line.length > 0 && <p className="text-sm text-muted-foreground">{line.join(' · ')}</p>}
    </div>
  )
}

/**
 * Strengths and next steps as plain lists. The heading stays `foreground`; the
 * marker carries the tone, by shape as well as color.
 */
export function FeedbackList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'strength' | 'improvement'
}) {
  if (items.length === 0) return null
  // An arrow, not a minus: improvements are next steps, not deductions.
  const Marker = tone === 'strength' ? IconCheck : IconArrowNarrowRight

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className={cn('flex items-start gap-2.5 text-sm leading-relaxed', RESULT_PROSE)}>
            <Marker
              size={16}
              className={cn('mt-0.5 shrink-0', tone === 'strength' ? 'text-success' : 'text-warning')}
              aria-hidden="true"
            />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A titled block inside a result, separated from its siblings by a hairline. */
export function ResultSection({
  title,
  children,
  className,
}: {
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('border-t pt-5', className)}>
      {title && <h4 className="mb-2 text-sm font-semibold">{title}</h4>}
      {children}
    </div>
  )
}
