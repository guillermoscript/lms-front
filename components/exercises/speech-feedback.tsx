'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import type { SpeechEvaluation } from '@/lib/speech/types'
import { FeedbackList, ResultSection, RESULT_PROSE } from './result-parts'

interface SpeechFeedbackProps {
  evaluation: SpeechEvaluation
  onTryAgain?: () => void
  /** The caller renders the transcript itself (beside the player). */
  hideTranscript?: boolean
  /** The recorder is showing it already. */
  hideFocus?: boolean
  className?: string
}

/** One delivery figure, inline. Out-of-range pairs an icon and a hint with the
 * color, so it reads under any tenant palette. */
function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dd className={cn('text-base font-semibold tabular-nums', hint && 'text-warning')}>
        {hint && <IconAlertTriangle size={14} className="mr-1 inline -translate-y-px" aria-hidden="true" />}
        {value}
      </dd>
      <dt className="text-sm text-muted-foreground">
        {label}
        {hint && <span> ({hint})</span>}
      </dt>
    </div>
  )
}

type Segments = SpeechEvaluation['annotated_transcript']

/** What they said, read as prose: the longest text in a review, so learner
 * body size. Fillers pair weight with the tint; pauses switch to mono. */
export function AnnotatedTranscript({ segments }: { segments: Segments }) {
  return (
    <p className={cn('text-base leading-8 text-foreground/85', RESULT_PROSE)}>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.type === 'filler' && 'rounded px-0.5 bg-warning/15 text-warning font-medium',
            seg.type === 'long_pause' && 'rounded px-1 bg-muted text-muted-foreground text-sm font-mono'
          )}
        >
          {seg.text}
        </span>
      ))}
    </p>
  )
}

export function TranscriptLegend({ ns }: { ns: 'exercises.audio' | 'exercises.video' }) {
  const t = useTranslations(ns)
  return (
    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warning/30" aria-hidden="true" />
        {t('fillerWord')}
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted ring-1 ring-foreground/10" aria-hidden="true" />
        {t('longPause')}
      </span>
    </div>
  )
}

/**
 * The written half of a spoken attempt: delivery figures, what to work on,
 * and the transcript. The grade itself is `ResultVerdict`'s job — this used to
 * restate it as a banner and a ring.
 */
export function SpeechFeedback({ evaluation, onTryAgain, hideTranscript, hideFocus, className }: SpeechFeedbackProps) {
  const t = useTranslations('exercises.audio')
  const { strengths, improvements, focus_next, annotated_transcript, metrics } = evaluation
  const corrections = evaluation.corrections ?? []

  const wpmGood = metrics.wpm >= 100 && metrics.wpm <= 180
  const fillerGood = metrics.filler_count <= 3

  return (
    <div className={cn('space-y-5', className)}>
      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <Metric label={t('wpm')} value={metrics.wpm} hint={wpmGood ? undefined : t('wpmHint')} />
        <Metric
          label={t('fillers')}
          value={metrics.filler_count}
          hint={fillerGood ? undefined : t('fillersHint')}
        />
        <Metric label={t('pauses')} value={metrics.pause_count} />
        <Metric label={t('duration')} value={`${Math.round(metrics.duration_seconds)}s`} />
      </dl>

      {/* First, and the only filled block: it is the one line to act on. */}
      {focus_next && !hideFocus && (
        <div className="rounded-lg bg-muted/60 px-4 py-3">
          <h4 className="mb-1 text-sm font-semibold">{t('focusNext')}</h4>
          <p className={cn('text-sm leading-relaxed', RESULT_PROSE)}>{focus_next}</p>
        </div>
      )}

      {(strengths.length > 0 || improvements.length > 0) && (
        <ResultSection className="grid gap-5 sm:grid-cols-2 sm:gap-8">
          <FeedbackList title={t('strengths')} items={strengths} tone="strength" />
          <FeedbackList title={t('improvements')} items={improvements} tone="improvement" />
        </ResultSection>
      )}

      {/* Corrections — learner rubric only */}
      {corrections.length > 0 && (
        <ResultSection title={t('corrections')}>
          <ul className="space-y-3">
            {corrections.map((c, i) => (
              <li key={i} className={cn('text-sm', RESULT_PROSE)}>
                <p className="text-muted-foreground line-through decoration-destructive/60">{c.said}</p>
                <p className="font-medium">{c.better}</p>
                <p className="mt-0.5 text-muted-foreground">{c.why}</p>
              </li>
            ))}
          </ul>
        </ResultSection>
      )}

      {!hideTranscript && annotated_transcript.length > 0 && (
        <ResultSection title={t('annotatedTranscript')}>
          <AnnotatedTranscript segments={annotated_transcript} />
          <TranscriptLegend ns="exercises.audio" />
        </ResultSection>
      )}

      {/* Phone only, where the recorder is a tab away. From `lg` up the filled
          "Record again" sits right under the review. */}
      {onTryAgain && (
        <div className="border-t pt-5 lg:hidden">
          <Button variant="outline" size="lg" onClick={onTryAgain} className="gap-2">
            <IconRefresh size={16} aria-hidden="true" />
            {t('tryAgain')}
          </Button>
        </div>
      )}
    </div>
  )
}
