'use client'

import { useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Markdown from 'react-markdown'
import { useTranslations } from 'next-intl'
import confetti from 'canvas-confetti'
import {
  IconCheck,
  IconClock,
  IconFlame,
  IconInfoCircle,
  IconMicrophone,
  IconSparkles,
  IconLoader2,
  IconPlayerPlay,
  IconDownload,
  IconChevronDown,
  IconChevronUp,
  IconAlertTriangle,
  IconTarget,
  IconArrowRight,
  IconTrophy,
} from '@tabler/icons-react'
import { MediaRecorderComponent } from './media-recorder'
import { SpeechFeedback } from './speech-feedback'
import type { SpeechEvaluation } from '@/lib/speech/types'

interface SubmissionHistoryItem {
  id: number
  ai_evaluation: SpeechEvaluation | null
  score: number | null
  status: string
  media_url: string
  created_at: string
  duration_seconds: number | null
}

interface AudioExerciseProps {
  exercise: {
    id: number
    title: string
    description?: string
    instructions: string
    exercise_type: string
    difficulty_level: string
    time_limit?: number
    exercise_config?: {
      topic_prompt?: string
      min_duration_seconds?: number
      max_duration_seconds?: number
      passing_score?: number
      max_daily_attempts?: number
      rubric?: {
        filler_words?: boolean
        pace?: boolean
        structure?: boolean
        confidence?: boolean
      }
    }
    exercise_completions?: { score?: number; completed_at?: string }[]
  }
  isExerciseCompleted: boolean
  submissionHistory: SubmissionHistoryItem[]
  passingScore: number
  isExerciseCompletedSection?: React.ReactNode
  dailyAttemptsUsed?: number
  maxDailyAttempts?: number
}

type SubmitState = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error'

// --- Sub-components ---

function AttemptCounter({
  used,
  max,
}: {
  used: number
  max: number
}) {
  const t = useTranslations('exercises.audio')
  const remaining = max - used
  const isLow = remaining <= 2 && remaining > 0

  return (
    <div
      className={cn(
        'rounded-xl border-2 px-4 py-3 flex items-center justify-between gap-3 transition-colors',
        isLow
          ? 'border-amber-500/30 bg-amber-500/[0.04]'
          : 'border-border/50 bg-muted/20'
      )}
    >
      <span className={cn(
        'text-xs font-semibold tracking-wide',
        isLow ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
      )}>
        {t('attemptsUsedOf', { used, max })}
      </span>
      <div className="flex items-center gap-1.5">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 w-2 rounded-full transition-all duration-300',
              i < used
                ? isLow
                  ? 'bg-amber-500 scale-100'
                  : 'bg-primary scale-100'
                : 'bg-muted-foreground/20 scale-90'
            )}
          />
        ))}
      </div>
    </div>
  )
}

function RetryPanel({
  score,
  passingScore,
  onRecordAgain,
}: {
  score: number
  passingScore: number
  onRecordAgain: () => void
}) {
  const t = useTranslations('exercises.audio')
  const pointsAway = Math.max(0, passingScore - Math.round(score))

  return (
    <div className="rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/[0.04] to-primary/[0.01] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-black tabular-nums tracking-tight text-foreground">
              {Math.round(score)}
            </span>
            <span className="text-lg font-bold text-muted-foreground/60">/</span>
            <span className="text-lg font-bold text-primary tabular-nums">
              {passingScore}
            </span>
          </div>
        </div>
        <div className="rounded-full border-2 border-primary/20 bg-primary/5 p-2.5">
          <IconTarget size={20} className="text-primary" />
        </div>
      </div>

      {pointsAway > 0 && (
        <p className="text-sm font-medium text-muted-foreground">
          {t('pointsAway', { points: pointsAway })}
        </p>
      )}

      <Button
        onClick={onRecordAgain}
        className="w-full gap-2.5 h-12 text-sm font-bold tracking-wide"
      >
        <IconMicrophone size={18} />
        {t('recordAgain')}
        <IconArrowRight size={16} className="ml-auto opacity-60" />
      </Button>
    </div>
  )
}

function CollapsibleFeedbackSummary({
  evaluation,
}: {
  evaluation: SpeechEvaluation
}) {
  const t = useTranslations('exercises.audio')
  const [open, setOpen] = useState(true)
  const { improvements, focus_next } = evaluation

  if (improvements.length === 0 && !focus_next) return null

  return (
    <div className="rounded-xl border-2 border-amber-500/15 bg-amber-500/[0.03] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/[0.03] transition-colors"
      >
        <span className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400 flex items-center gap-2">
          <IconAlertTriangle size={13} />
          {t('improvementFocus')}
        </span>
        {open ? (
          <IconChevronUp size={14} className="text-amber-600/60" />
        ) : (
          <IconChevronDown size={14} className="text-amber-600/60" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {improvements.length > 0 && (
            <ul className="space-y-1.5">
              {improvements.map((imp, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <span className="mt-0.5 shrink-0 text-amber-500">•</span>
                  {imp}
                </li>
              ))}
            </ul>
          )}

          {focus_next && (
            <div className="rounded-lg bg-primary/[0.05] border border-primary/10 px-3 py-2.5">
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">
                {t('focusNext')}
              </p>
              <p className="text-sm text-foreground/80">{focus_next}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CompletionSummary({
  score,
  passingScore,
  completedDate,
}: {
  score: number
  passingScore: number
  completedDate?: string
}) {
  const t = useTranslations('exercises.audio')
  const dateStr = completedDate
    ? new Date(completedDate).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    : undefined

  return (
    <div className="rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-emerald-500/[0.02] p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
            <IconTrophy size={18} />
            {t('completedScore')}
          </h3>
          {dateStr && (
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60 mt-1">
              {t('completedOn', { date: dateStr })}
            </p>
          )}
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-black tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
            {Math.round(score)}
          </span>
          <span className="text-lg font-bold text-emerald-600/40">/</span>
          <span className="text-lg font-bold text-emerald-600/60 tabular-nums">100</span>
        </div>
      </div>
      <p className="text-sm text-emerald-600/80 dark:text-emerald-400/70">
        {t('exerciseMarkedComplete')}
      </p>
    </div>
  )
}

// --- Main component ---

export default function AudioExercise({
  exercise,
  isExerciseCompleted,
  submissionHistory: initialHistory,
  passingScore,
  isExerciseCompletedSection,
  dailyAttemptsUsed: serverDailyAttemptsUsed,
  maxDailyAttempts: serverMaxDailyAttempts,
}: AudioExerciseProps) {
  const t = useTranslations('exercises.audio')

  const config = exercise.exercise_config ?? {}
  const maxDaily = serverMaxDailyAttempts ?? config.max_daily_attempts ?? 5
  const isUnlimited = maxDaily === 0

  const latestSubmission = initialHistory[0] ?? null
  const latestEvaluation = latestSubmission?.ai_evaluation ?? null

  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [evaluation, setEvaluation] = useState<SpeechEvaluation | null>(latestEvaluation)
  const [passed, setPassed] = useState<boolean | undefined>(
    isExerciseCompleted ? true : latestSubmission ? latestSubmission.status === 'completed' : undefined
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [showRecorder, setShowRecorder] = useState(!latestEvaluation)
  const [dailyLimitReached, setDailyLimitReached] = useState(
    !isUnlimited && (serverDailyAttemptsUsed ?? 0) >= maxDaily
  )
  const [attemptsUsed, setAttemptsUsed] = useState(serverDailyAttemptsUsed ?? 0)
  const [submissionHistory, setSubmissionHistory] = useState(initialHistory)

  // Best completion score from DB (for revisit display)
  const completionData = exercise.exercise_completions?.[0]
  const completionScore = completionData?.score ?? (evaluation?.score || 0)
  const completionDate = completionData?.completed_at
    ?? submissionHistory.find(s => s.status === 'completed')?.created_at

  const difficultyLabels: Record<string, string> = {
    easy: t('beginner'),
    medium: t('intermediate'),
    hard: t('advanced'),
  }
  const difficultyConfig: Record<string, { color: string; icon: typeof IconFlame }> = {
    easy: { color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20', icon: IconSparkles },
    medium: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: IconFlame },
    hard: { color: 'text-rose-600 bg-rose-500/10 border-rose-500/20', icon: IconFlame },
  }

  const difficulty = difficultyConfig[exercise.difficulty_level] || difficultyConfig.easy
  const difficultyLabel = difficultyLabels[exercise.difficulty_level] || difficultyLabels.easy
  const DifficultyIcon = difficulty.icon
  const minDuration = config.min_duration_seconds ?? 5
  const maxDuration = config.max_duration_seconds ?? 300

  const formatDuration = (sec: number) => {
    if (sec >= 60) {
      const m = Math.floor(sec / 60)
      const s = sec % 60
      return s ? `${m}m ${s}s` : `${m}m`
    }
    return `${sec}s`
  }

  // Whether to show the retry panel (failed, recorder hidden, not already passed)
  const showRetryPanel =
    evaluation && !showRecorder && passed !== true && !dailyLimitReached

  // Whether to show the collapsible feedback summary alongside the recorder
  const showFeedbackSummary =
    evaluation && showRecorder && passed !== true

  const handleRecordingComplete = useCallback(async (blob: Blob, duration: number) => {
    setSubmitState('uploading')
    setErrorMsg(null)

    try {
      // 1. Get a signed upload URL
      const uploadRes = await fetch('/api/exercises/media/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: exercise.id,
          mediaType: 'audio',
          filename: `recording_${Date.now()}.webm`,
        }),
      })

      if (!uploadRes.ok) {
        if (uploadRes.status === 429) {
          try {
            const errData = await uploadRes.json()
            if (errData.error === 'daily_limit_reached') {
              setDailyLimitReached(true)
              setAttemptsUsed(maxDaily)
              setSubmitState('error')
              return
            }
          } catch { /* fall through */ }
        }
        const msg = await uploadRes.text()
        throw new Error(msg || 'Failed to get upload URL')
      }

      const { submissionId, uploadUrl, dailyAttemptsUsed: newUsed } = await uploadRes.json()
      setAttemptsUsed(newUsed)

      // 2. Upload the blob to Supabase Storage via signed URL
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })

      if (!putRes.ok) throw new Error('Failed to upload audio file')

      // 3. Trigger analysis
      setSubmitState('analyzing')

      const analyzeRes = await fetch('/api/exercises/media/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId }),
      })

      if (!analyzeRes.ok) {
        const msg = await analyzeRes.text()
        throw new Error(msg || 'Analysis failed')
      }

      const { evaluation: result, passed: didPass } = await analyzeRes.json()
      setEvaluation(result)
      setPassed(didPass)
      setShowRecorder(false)
      setSubmitState('done')

      // Fire confetti on passing
      if (didPass) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#10b981', '#f59e0b'],
        })
      }

      // Add to history
      setSubmissionHistory(prev => [{
        id: submissionId,
        ai_evaluation: result,
        score: result.score,
        status: didPass ? 'completed' : 'failed',
        media_url: '',
        created_at: new Date().toISOString(),
        duration_seconds: result.metrics?.duration_seconds ?? null,
      }, ...prev])
    } catch (err: any) {
      console.error('Audio submission error:', err)
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setSubmitState('error')
    }
  }, [exercise.id, maxDaily])

  const handleTryAgain = () => {
    setShowRecorder(true)
    setSubmitState('idle')
    setErrorMsg(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-bold border-2 text-primary border-primary/20 bg-primary/5 uppercase tracking-wider text-[10px] px-2.5 py-0.5">
            <IconMicrophone size={10} className="mr-1" aria-hidden="true" />
            {t('title')}
          </Badge>
          <Badge variant="outline" className={cn('font-bold border text-[10px] px-2.5 py-0.5 uppercase tracking-wider', difficulty.color)}>
            <DifficultyIcon size={11} className="mr-1" aria-hidden="true" />
            {difficultyLabel}
          </Badge>
          {exercise.time_limit && (
            <Badge variant="outline" className="font-bold border text-[10px] px-2.5 py-0.5 uppercase tracking-wider text-muted-foreground">
              <IconClock size={11} className="mr-1" aria-hidden="true" />
              {exercise.time_limit} min
            </Badge>
          )}
          {(isExerciseCompleted || passed === true) && (
            <Badge className="bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-0.5 uppercase tracking-wider">
              <IconCheck size={11} className="mr-1" aria-hidden="true" />
              {t('completed')}
            </Badge>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-balance leading-tight">
          {exercise.title}
        </h1>

        {exercise.description && (
          <div className="text-muted-foreground text-sm md:text-base leading-relaxed max-w-2xl prose prose-sm prose-neutral dark:prose-invert prose-p:text-muted-foreground prose-p:leading-relaxed">
            <Markdown>{exercise.description}</Markdown>
          </div>
        )}
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Instructions */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden">
            <div className="px-5 py-3.5 border-b border-primary/10 bg-primary/[0.03]">
              <h2 className="font-bold text-xs flex items-center gap-2 text-primary uppercase tracking-wider">
                <IconInfoCircle size={14} aria-hidden="true" />
                {t('instructions')}
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/80 prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-bold prose-li:text-foreground/80 prose-headings:text-sm">
                <Markdown>{exercise.instructions}</Markdown>
              </div>
            </div>
          </div>

          {config.topic_prompt && (
            <div className="rounded-2xl border-2 border-violet-500/15 bg-violet-500/[0.03] px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400 mb-2">
                {t('topicPrompt')}
              </p>
              <p className="text-sm text-foreground/80 leading-relaxed">{config.topic_prompt}</p>
            </div>
          )}

          {isExerciseCompletedSection && (
            <div className="space-y-4">{isExerciseCompletedSection}</div>
          )}
        </div>

        {/* Right: Recorder / Results */}
        <div className="lg:col-span-8">
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* 0. Completion summary (when exercise is completed from DB) */}
            {(isExerciseCompleted || passed === true) && (
              <CompletionSummary
                score={completionScore}
                passingScore={passingScore}
                completedDate={completionDate}
              />
            )}

            {/* 1. Attempt Counter (visible when limited AND not yet completed) */}
            {!isUnlimited && passed !== true && (
              <AttemptCounter used={attemptsUsed} max={maxDaily} />
            )}

            {/* 2. Daily limit banner */}
            {dailyLimitReached && passed !== true && (
              <div className="rounded-xl border-2 border-amber-500/20 bg-amber-500/[0.05] p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-500/10 p-2">
                    <IconAlertTriangle size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-amber-700 dark:text-amber-400">{t('dailyLimitReached')}</h3>
                    <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                      {t('dailyLimitMessage', { limit: maxDaily })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. Retry Panel (after failing, recorder hidden) */}
            {showRetryPanel && (
              <RetryPanel
                score={evaluation.score}
                passingScore={passingScore}
                onRecordAgain={handleTryAgain}
              />
            )}

            {/* 4. Collapsible feedback summary (visible alongside recorder on retry) */}
            {showFeedbackSummary && (
              <CollapsibleFeedbackSummary evaluation={evaluation} />
            )}

            {/* 5. Recording area */}
            {showRecorder && !dailyLimitReached && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold flex items-center gap-2">
                  <IconMicrophone size={16} className="text-primary" />
                  {t('recordYourResponse')}
                </h3>

                {errorMsg && (
                  <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    {errorMsg}
                  </div>
                )}

                {submitState === 'analyzing' && (
                  <div className="mb-4 flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                    <IconLoader2 size={16} className="animate-spin text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{t('analyzing')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('analyzingDescription')}</p>
                    </div>
                  </div>
                )}

                {submitState !== 'analyzing' && (
                  <MediaRecorderComponent
                    onRecordingComplete={handleRecordingComplete}
                    isSubmitting={submitState === 'uploading'}
                    minDurationSeconds={minDuration}
                    maxDurationSeconds={maxDuration}
                    disabled={submitState === 'uploading'}
                  />
                )}

                <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-4">
                  <span>{t('durationRange', { min: `${minDuration}s`, max: formatDuration(maxDuration) })}</span>
                  <span>{t('uploadLimit')}</span>
                </div>
              </div>
            )}

            {/* 6. Full Feedback (when recorder is hidden) */}
            {evaluation && !showRecorder && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-5 text-sm font-semibold flex items-center gap-2">
                  <IconSparkles size={16} className="text-primary" />
                  {t('aiFeedback')}
                </h3>
                <SpeechFeedback
                  evaluation={evaluation}
                  passed={passed}
                  passingScore={passingScore}
                  onTryAgain={passed !== true && !dailyLimitReached ? handleTryAgain : undefined}
                />
              </div>
            )}

            {/* 7. Submission History */}
            {submissionHistory.length > 0 && (
              <div className="rounded-xl border bg-card p-5">
                <h3 className="mb-4 text-sm font-semibold flex items-center gap-2">
                  <IconClock size={16} className="text-muted-foreground" />
                  {t('submissionHistory')}
                </h3>
                <div className="space-y-3">
                  {submissionHistory.map((sub, idx) => (
                    <SubmissionHistoryRow
                      key={sub.id}
                      submission={sub}
                      attemptNumber={submissionHistory.length - idx}
                      passingScore={passingScore}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SubmissionHistoryRow({
  submission,
  attemptNumber,
  passingScore,
}: {
  submission: SubmissionHistoryItem
  attemptNumber: number
  passingScore: number
}) {
  const t = useTranslations('exercises.audio')
  const [expanded, setExpanded] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [loadingAudio, setLoadingAudio] = useState(false)

  const score = submission.score ?? 0
  const didPass = submission.status === 'completed'
  const date = new Date(submission.created_at)

  const fetchAudio = async () => {
    if (audioUrl || loadingAudio) return
    setLoadingAudio(true)
    try {
      const res = await fetch('/api/exercises/media/signed-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submission.id }),
      })
      if (res.ok) {
        const { signedUrl } = await res.json()
        setAudioUrl(signedUrl)
      }
    } catch {
      // silently fail
    } finally {
      setLoadingAudio(false)
    }
  }

  return (
    <div className="rounded-xl border bg-muted/20">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {t('attempt', { number: attemptNumber })}
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-bold px-2 py-0',
                didPass
                  ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10'
                  : 'border-amber-500/30 text-amber-600 bg-amber-500/10'
              )}
            >
              {Math.round(score)}/100
            </Badge>
            {didPass && <IconCheck size={14} className="text-emerald-500" />}
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span>{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            {submission.duration_seconds && (
              <span>{Math.round(submission.duration_seconds)}s</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {submission.media_url && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchAudio}
                disabled={loadingAudio}
                className="h-8 w-8 p-0"
              >
                {loadingAudio ? (
                  <IconLoader2 size={14} className="animate-spin" />
                ) : (
                  <IconPlayerPlay size={14} />
                )}
              </Button>
              {audioUrl && (
                <a href={audioUrl} download className="inline-flex">
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <IconDownload size={14} />
                  </Button>
                </a>
              )}
            </>
          )}
          {submission.ai_evaluation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-8 px-2 text-xs gap-1"
            >
              {expanded ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              {expanded ? t('hideDetails') : t('details')}
            </Button>
          )}
        </div>
      </div>

      {/* Audio player */}
      {audioUrl && (
        <div className="px-4 pb-3">
          <audio src={audioUrl} controls className="w-full h-8 rounded" />
        </div>
      )}

      {/* Expanded feedback */}
      {expanded && submission.ai_evaluation && (
        <div className="border-t px-4 py-4">
          <SpeechFeedback
            evaluation={submission.ai_evaluation}
            passed={didPass}
            passingScore={passingScore}
          />
        </div>
      )}
    </div>
  )
}
