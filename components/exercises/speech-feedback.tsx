'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconRefresh, IconMicrophone, IconPlayerPlay, IconCheck, IconAlertTriangle } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'
import type { SpeechEvaluation } from '@/lib/speech/types'

interface SpeechFeedbackProps {
  evaluation: SpeechEvaluation
  onTryAgain?: () => void
  passed?: boolean
  passingScore?: number
  className?: string
}

function ScoreCircle({ score, label, passingScore }: { score: number; label: string; passingScore?: number }) {
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference

  const color =
    score >= 80 ? 'text-emerald-500 stroke-emerald-500' :
    score >= 60 ? 'text-amber-500 stroke-amber-500' :
    'text-rose-500 stroke-rose-500'

  // Threshold marker in un-rotated SVG space (parent CSS -rotate-90 handles visual positioning)
  // Arc fills clockwise from 3 o'clock (0°) in SVG coords
  const thresholdRad = passingScore ? (passingScore / 100) * 2 * Math.PI : null
  const svgCx = 56
  const svgCy = 56
  const markerX = thresholdRad !== null ? svgCx + radius * Math.cos(thresholdRad) : 0
  const markerY = thresholdRad !== null ? svgCy + radius * Math.sin(thresholdRad) : 0

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="112" height="112" viewBox="0 0 112 112">
        <circle
          cx="56" cy="56" r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-muted/30"
        />
        <circle
          cx="56" cy="56" r={radius}
          fill="none"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn('transition-all duration-700', color)}
        />
        {/* Passing score threshold marker */}
        {passingScore && thresholdRad !== null && (
          <>
            <circle
              cx={markerX}
              cy={markerY}
              r="3"
              className="fill-foreground/40"
            />
            <circle
              cx={markerX}
              cy={markerY}
              r="1.5"
              className="fill-background"
            />
          </>
        )}
      </svg>
      <div className="relative text-center">
        <div className={cn('text-3xl font-black tabular-nums leading-none', color.split(' ')[0])}>
          {Math.round(score)}
        </div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function MetricBadge({ label, value, good }: { label: string; value: string | number; good?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border bg-card px-4 py-3 text-center min-w-[80px]">
      <span className={cn(
        'text-lg font-black tabular-nums',
        good === true ? 'text-emerald-600' :
        good === false ? 'text-amber-600' :
        'text-foreground'
      )}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
    </div>
  )
}

export function SpeechFeedback({ evaluation, onTryAgain, passed, passingScore, className }: SpeechFeedbackProps) {
  const t = useTranslations('exercises.audio')
  const { score, strengths, improvements, focus_next, annotated_transcript, metrics } = evaluation

  const wpmGood = metrics.wpm >= 100 && metrics.wpm <= 180
  const fillerGood = metrics.filler_count <= 3

  return (
    <div className={cn('space-y-6', className)}>
      {/* Pass/fail banner */}
      {passed !== undefined && (
        passed ? (
          <div className="rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/[0.05] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-500/10 p-2">
                <IconCheck size={20} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="font-bold text-emerald-700 dark:text-emerald-400">{t('passed')}</h3>
                <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">{t('passedMessage')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-amber-500/20 bg-amber-500/[0.05] p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-500/10 p-2">
                <IconAlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="font-bold text-amber-700 dark:text-amber-400">{t('notPassed')}</h3>
                <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                  {t('notPassedMessage', { score: passingScore ?? 70 })}
                </p>
              </div>
            </div>
          </div>
        )
      )}

      {/* Score + Metrics row */}
      <div className="flex flex-wrap items-center gap-6">
        <ScoreCircle score={score} label={t('score')} passingScore={passingScore} />

        <div className="flex flex-wrap gap-3">
          <MetricBadge
            label={t('wpm')}
            value={metrics.wpm}
            good={wpmGood}
          />
          <MetricBadge
            label={t('fillers')}
            value={metrics.filler_count}
            good={fillerGood}
          />
          <MetricBadge
            label={t('pauses')}
            value={metrics.pause_count}
          />
          <MetricBadge
            label={t('duration')}
            value={`${Math.round(metrics.duration_seconds)}s`}
          />
        </div>
      </div>

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="rounded-2xl border-2 border-emerald-500/15 bg-emerald-500/[0.03] p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            {t('strengths')}
          </h3>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 shrink-0 text-emerald-500">•</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {improvements.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-500/15 bg-amber-500/[0.03] p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
            {t('improvements')}
          </h3>
          <ul className="space-y-2">
            {improvements.map((imp, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                {imp}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Focus Next */}
      {focus_next && (
        <div className="rounded-2xl border-2 border-primary/15 bg-primary/[0.03] p-5">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-primary flex items-center gap-2">
            {t('focusNext')}
          </h3>
          <p className="text-sm text-foreground/80">{focus_next}</p>
        </div>
      )}

      {/* Annotated Transcript */}
      {annotated_transcript.length > 0 && (
        <div className="rounded-2xl border bg-card p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <IconPlayerPlay size={12} />
            {t('annotatedTranscript')}
          </h3>
          <div className="text-sm leading-7 text-foreground/80">
            {annotated_transcript.map((seg, i) => (
              <span
                key={i}
                className={cn(
                  seg.type === 'filler' && 'rounded px-0.5 bg-orange-500/15 text-orange-700 dark:text-orange-400 font-medium',
                  seg.type === 'long_pause' && 'rounded px-1 bg-muted text-muted-foreground text-xs font-mono'
                )}
              >
                {seg.text}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded bg-orange-500/30" />
              {t('fillerWord')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded bg-muted" />
              {t('longPause')}
            </span>
          </div>
        </div>
      )}

      {/* Try again — only show if not passed */}
      {onTryAgain && passed !== true && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={onTryAgain} className="gap-2">
            <IconRefresh size={15} />
            {t('tryAgain')}
          </Button>
        </div>
      )}
    </div>
  )
}
