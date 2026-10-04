'use client'

import { useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
  IconMicrophone,
  IconPlayerPlay,
  IconTarget,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { SpeechEvaluation } from '@/lib/speech/types'
import ExerciseBrief from './exercise-brief'
import { AnnotatedTranscript, SpeechFeedback, TranscriptLegend } from './speech-feedback'
import { SyncedTranscript } from './synced-transcript'
import { EXERCISE_SURFACE, FeedbackList, ResultVerdict, RESULT_PROSE } from './result-parts'

/**
 * The three workspace panels of a recorded exercise. Audio and video were two
 * copies of the same 700 lines; they differ in the recorder, the player in a
 * history row, and their strings, which is all each engine still owns.
 */
export type MediaNamespace = 'exercises.audio' | 'exercises.video'

export type MediaSubmitState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

export function formatSeconds(sec: number) {
  if (sec >= 60) {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return s ? `${m}m ${s}s` : `${m}m`
  }
  return `${sec}s`
}

export function MediaBriefPanel({
  ns,
  instructions,
  topicPrompt,
}: {
  ns: MediaNamespace
  instructions: string
  topicPrompt?: string
}) {
  const t = useTranslations(ns)

  return (
    <div className="space-y-6">
      {/* The prompt is the exercise. It is set like an exam question, not
          filed in a box beside the instructions. */}
      {topicPrompt && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{t('topicPrompt')}</h2>
          <p className="max-w-[48ch] text-xl font-medium leading-relaxed text-balance sm:text-2xl sm:leading-relaxed">
            {topicPrompt}
          </p>
        </div>
      )}
      <ExerciseBrief instructions={instructions} />
    </div>
  )
}

interface MediaTaskPanelProps {
  ns: MediaNamespace
  /** The engine's recorder, already wired to its submit handler. */
  recorder: ReactNode
  submitState: MediaSubmitState
  errorMsg: string | null
  /** Last graded attempt, when there is one. */
  evaluation: SpeechEvaluation | null
  passed: boolean | undefined
  showRecorder: boolean
  dailyLimitReached: boolean
  /** 0 = unlimited. */
  maxDaily: number
  attemptsUsed: number
  minDuration: number
  maxDuration: number
  onRecordAgain: () => void
  /** Defaults to a microphone. */
  recordIcon?: ReactNode
}

/**
 * The doing surface. One container whatever the state, so the panel never
 * renders empty — a passed exercise used to leave this tab blank on a phone.
 */
export function MediaTaskPanel({
  ns,
  recorder,
  submitState,
  errorMsg,
  evaluation,
  passed,
  showRecorder,
  dailyLimitReached,
  maxDaily,
  attemptsUsed,
  minDuration,
  maxDuration,
  onRecordAgain,
  recordIcon,
}: MediaTaskPanelProps) {
  const t = useTranslations(ns)
  const isUnlimited = maxDaily === 0
  const remaining = maxDaily - attemptsUsed
  const attemptsLow = !isUnlimited && remaining <= 2 && remaining > 0

  const blocked = dailyLimitReached && passed !== true
  const recording = showRecorder && !blocked

  // Between attempts there is nothing to frame: a line and the next action.
  if (!recording && !blocked) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {passed === true ? (
          <p className={cn('flex items-start gap-2 text-sm leading-relaxed', RESULT_PROSE)}>
            <IconCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            {t('passedRecordAgain')}
          </p>
        ) : (
          <p className={cn('flex items-start gap-2 text-sm leading-relaxed', RESULT_PROSE)}>
            <IconTarget size={16} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
            {/* Not the score again — the review above just said it. */}
            {!isUnlimited
              ? t('attemptsUsedOf', { used: attemptsUsed, max: maxDaily })
              : evaluation
                ? t('lastAttempt', { score: Math.round(evaluation.score) })
                : t('recordYourResponse')}
          </p>
        )}
        <Button
          onClick={onRecordAgain}
          variant={passed === true ? 'outline' : 'default'}
          size="lg"
          className="h-11 shrink-0 gap-2 text-sm sm:px-6"
        >
          {recordIcon ?? <IconMicrophone size={18} aria-hidden="true" />}
          {t('recordAgain')}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn(EXERCISE_SURFACE, 'space-y-5')}>
      <h2 className="sr-only">{t('recordYourResponse')}</h2>

      {blocked && (
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <IconAlertTriangle size={16} className="shrink-0" aria-hidden="true" />
            {t('dailyLimitReached')}
          </p>
          <p className={cn('text-sm text-muted-foreground', RESULT_PROSE)}>
            {t('dailyLimitMessage', { limit: maxDaily })}
          </p>
        </div>
      )}

      {recording && (
        <>
          {/* Beside the recorder on a retry: the one place the student needs
              the advice and the control at the same time. */}
          {evaluation && passed !== true && (
            <div className="rounded-lg bg-muted/60 px-4 py-3">
              {evaluation.focus_next ? (
                <>
                  <h3 className="mb-1 text-sm font-semibold">{t('focusNext')}</h3>
                  <p className={cn('text-sm leading-relaxed', RESULT_PROSE)}>{evaluation.focus_next}</p>
                </>
              ) : (
                <FeedbackList title={t('improvementFocus')} items={evaluation.improvements} tone="improvement" />
              )}
            </div>
          )}

          {errorMsg && (
            <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              {errorMsg}
            </p>
          )}

          {submitState === 'analyzing' ? (
            <div className="flex items-start gap-3 py-6" role="status">
              <IconLoader2
                size={18}
                className="mt-0.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium">{t('analyzing')}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t('analyzingDescription')}</p>
              </div>
            </div>
          ) : (
            recorder
          )}
        </>
      )}

      {/* The limits, as one quiet line. The attempt count used to be a row of
          dots in a bordered box above everything else. */}
      {(recording || passed !== true) && !blocked && (
        <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t pt-4 text-sm text-muted-foreground">
          <span>{t('durationRange', { min: `${minDuration}s`, max: formatSeconds(maxDuration) })}</span>
          <span>{t('uploadLimit')}</span>
          {!isUnlimited && (
            <span className={cn('flex items-center gap-1', attemptsLow && 'font-medium text-warning')}>
              {attemptsLow && <IconAlertTriangle size={14} aria-hidden="true" />}
              {t('attemptsUsedOf', { used: attemptsUsed, max: maxDaily })}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

export interface MediaAttempt {
  id: number
  ai_evaluation: SpeechEvaluation | null
  score: number | null
  status: string
  /** `exercise_media_submissions.id` — what the signed-url route is keyed on. */
  submission_id: number | null
  created_at: string
  duration_seconds: number | null
}

interface MediaResultPanelProps {
  ns: MediaNamespace
  mediaType: 'audio' | 'video'
  /** Newest first. */
  attempts: MediaAttempt[]
  isCompleted: boolean
  passingScore: number
  /** Best score on record, which can beat the attempt being shown. */
  completionScore: number | null
  completionDate?: string
  onTryAgain?: () => void
  /** The recorder is open and already carries the focus note. */
  recording?: boolean
}

/**
 * One review at a time. Past attempts used to be a list of rows under the
 * latest result, each expanding into a second copy of the whole feedback
 * block, with the recording hidden behind a play icon in the row. Now the
 * attempt is a switch above a single review, and listening back is part of it.
 */
export function MediaResultPanel({
  ns,
  mediaType,
  attempts,
  isCompleted,
  passingScore,
  completionScore,
  completionDate,
  onTryAgain,
  recording = false,
}: MediaResultPanelProps) {
  const t = useTranslations(ns)
  const locale = useLocale()
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Falls back to the newest, so a fresh grade is shown without an effect.
  const selected = attempts.find((a) => a.id === selectedId) ?? attempts[0] ?? null
  const isLatest = selected !== null && selected.id === attempts[0]?.id
  const number = selected ? attempts.length - attempts.indexOf(selected) : 0

  const didPass = selected ? selected.status === 'completed' : isCompleted
  const shownScore = selected ? selected.score : completionScore

  const best =
    isCompleted && completionScore !== null && shownScore !== null &&
    Math.round(completionScore) > Math.round(shownScore)
      ? t('bestScore', { score: Math.round(completionScore) })
      : null

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' })

  const meta = [
    selected ? t('attempt', { number }) : null,
    selected ? formatDate(selected.created_at) : null,
    best,
    !selected && completionDate ? t('completedOn', { date: formatDate(completionDate) }) : null,
  ]

  return (
    <div className="space-y-4">
      {attempts.length > 1 && (
        <div
          role="group"
          aria-label={t('submissionHistory')}
          className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1"
        >
          {attempts.map((a, idx) => {
            const active = a.id === selected?.id
            const passedAttempt = a.status === 'completed'
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedId(a.id)}
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-button px-3 text-sm ring-1 transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  // Fill and weight together carry the selection.
                  active
                    ? 'bg-foreground font-semibold text-background ring-foreground'
                    : 'ring-foreground/15 hover:bg-muted'
                )}
              >
                {t('attempt', { number: attempts.length - idx })}
                {/* Ungraded shows as ungraded, never as 0. */}
                {a.score !== null && <span className="tabular-nums">· {Math.round(a.score)}</span>}
                {passedAttempt && <IconCheck size={14} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}

      <div className={cn(EXERCISE_SURFACE, 'space-y-5')}>
        <ResultVerdict score={shownScore} passed={didPass} passingScore={passingScore} meta={meta} />

        {selected?.submission_id != null && (
          // Keyed: a new attempt gets a new player, not the last one's URL.
          <AttemptPlayback
            key={selected.id}
            ns={ns}
            mediaType={mediaType}
            submissionId={selected.submission_id}
            evaluation={selected.ai_evaluation}
          />
        )}

        {selected?.ai_evaluation ? (
          <SpeechFeedback
            evaluation={selected.ai_evaluation}
            onTryAgain={isLatest ? onTryAgain : undefined}
            hideTranscript={mediaType === 'audio'}
            hideFocus={recording && isLatest}
          />
        ) : (
          selected && <p className="text-sm text-muted-foreground">{t('noFeedbackForAttempt')}</p>
        )}
      </div>
    </div>
  )
}

/**
 * The recording, fetched on demand (the URL is signed and short-lived). For
 * audio the transcript lives here too: once the file is loaded it follows the
 * playhead and seeks on click, so reading and listening are one thing.
 */
function AttemptPlayback({
  ns,
  mediaType,
  submissionId,
  evaluation,
}: {
  ns: MediaNamespace
  mediaType: 'audio' | 'video'
  submissionId: number
  evaluation: SpeechEvaluation | null
}) {
  const t = useTranslations(ns)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [currentTime, setCurrentTime] = useState(0)
  const mediaRef = useRef<HTMLAudioElement>(null)

  const load = async () => {
    if (url || state === 'loading') return
    setState('loading')
    try {
      const res = await fetch('/api/exercises/media/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })
      if (!res.ok) throw new Error('signed-url')
      const { signedUrl } = await res.json()
      setUrl(signedUrl)
      setState('idle')
    } catch {
      // It used to fail silently: the button spun and then did nothing.
      setState('error')
    }
  }

  const segments = evaluation?.annotated_transcript ?? []
  const timed = segments.some((seg) => typeof seg.timestamp_ms === 'number')

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">
          {mediaType === 'audio' ? t('annotatedTranscript') : t('yourRecording')}
        </h4>
        {!url && (
          <Button variant="outline" onClick={load} disabled={state === 'loading'} className="h-10 gap-2 px-4 text-sm">
            {state === 'loading' ? (
              <IconLoader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <IconPlayerPlay size={16} aria-hidden="true" />
            )}
            {t('playRecording')}
          </Button>
        )}
      </div>

      {state === 'error' && (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('playbackError')}
        </p>
      )}

      {url && mediaType === 'audio' && (
        <audio
          ref={mediaRef}
          src={url}
          controls
          autoPlay
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          className="h-10 w-full"
        />
      )}
      {url && mediaType === 'video' && (
        <video src={url} controls playsInline className="aspect-video w-full rounded-lg bg-black" />
      )}

      {mediaType === 'audio' && segments.length > 0 && (
        <>
          {url && timed ? (
            <SyncedTranscript
              segments={segments}
              currentTime={currentTime}
              onSeek={(seconds) => {
                if (mediaRef.current) mediaRef.current.currentTime = seconds
                setCurrentTime(seconds)
              }}
            />
          ) : (
            <AnnotatedTranscript segments={segments} />
          )}
          <TranscriptLegend ns={ns} />
        </>
      )}
    </div>
  )
}
