'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'
import { cn } from '@/lib/utils'
import Markdown from 'react-markdown'
import { useTranslations } from 'next-intl'
import confetti from 'canvas-confetti'
import { toast } from 'sonner'
import {
  IconCheck,
  IconClock,
  IconFlame,
  IconInfoCircle,
  IconSparkles,
  IconLoader2,
  IconAlertTriangle,
  IconArrowRight,
  IconTrophy,
  IconCode,
} from '@tabler/icons-react'

interface ArtifactExerciseProps {
  exercise: {
    id: number
    title: string
    instructions: string
    exercise_type: string
    difficulty_level: string
    time_limit?: number
    exercise_config?: {
      artifact_type?: string
      artifact_html?: string
      passing_score?: number
    }
    exercise_completions?: { score?: number; completed_at?: string }[]
  }
  isExerciseCompleted: boolean
  passingScore: number
  isExerciseCompletedSection?: React.ReactNode
  /** Last graded attempt from exercise_evaluations. The route has always written
   * one; it was simply never read back, so reloading the page lost the feedback. */
  initialEvaluation?: EvaluationResult | null
}

interface EvaluationResult {
  score: number
  feedback: string
  passed: boolean
  strengths: string[]
  improvements: string[]
  passingScore: number
}

type SubmitState = 'idle' | 'evaluating' | 'done' | 'error'

export default function ArtifactExercise({
  exercise,
  isExerciseCompleted,
  passingScore,
  isExerciseCompletedSection,
  initialEvaluation = null,
}: ArtifactExerciseProps) {
  const t = useTranslations('exercises.artifact')
  const tAudio = useTranslations('exercises.audio')
  const tGamification = useTranslations('gamification')

  const config = exercise.exercise_config ?? {}
  const artifactHtml = config.artifact_html ?? ''

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(initialEvaluation)
  const [passed, setPassed] = useState<boolean>(isExerciseCompleted)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)

  const completionData = exercise.exercise_completions?.[0]
  const completionScore = completionData?.score ?? (evaluation?.score || 0)
  const completionDate = completionData?.completed_at

  const difficultyLabels: Record<string, string> = {
    easy: tAudio('beginner'),
    medium: tAudio('intermediate'),
    hard: tAudio('advanced'),
  }
  const difficultyConfig: Record<string, { color: string; icon: typeof IconFlame }> = {
    easy: { color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20', icon: IconSparkles },
    medium: { color: 'text-amber-600 bg-amber-500/10 border-amber-500/20', icon: IconFlame },
    hard: { color: 'text-rose-600 bg-rose-500/10 border-rose-500/20', icon: IconFlame },
  }

  const difficulty = difficultyConfig[exercise.difficulty_level] || difficultyConfig.easy
  const difficultyLabel = difficultyLabels[exercise.difficulty_level] || difficultyLabels.easy
  const DifficultyIcon = difficulty.icon

  const handleSubmit = useCallback(async (content: string, metadata: Record<string, unknown> = {}) => {
    setSubmitState('evaluating')
    setErrorMsg(null)
    setRateLimited(false)

    try {
      const res = await fetch('/api/exercises/artifact/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseId: exercise.id,
          content,
          metadata,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (data.rateLimited) {
          setRateLimited(true)
          setSubmitState('error')
          return
        }
        throw new Error(data.error || 'Evaluation failed')
      }

      const result: EvaluationResult = await res.json()
      setEvaluation(result)
      setPassed(result.passed)
      setSubmitState('done')

      // Send feedback back to iframe
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'FEEDBACK', payload: result },
        '*'
      )

      if (result.passed) {
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#10b981', '#f59e0b'],
        })
        toast.success(tGamification('xpAwarded.exercise_completion'))
      }
    } catch (err: any) {
      console.error('Artifact evaluation error:', err)
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setSubmitState('error')
    }
  }, [exercise.id])

  // Listen for postMessage from iframe
  useEffect(() => {
    function handler(event: MessageEvent) {
      // Validate source
      if (event.source !== iframeRef.current?.contentWindow) return

      const { type, payload } = event.data ?? {}
      if (type === 'SUBMIT' && payload) {
        handleSubmit(payload.content ?? '', payload.metadata ?? {})
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [handleSubmit])

  const handleTryAgain = () => {
    setSubmitState('idle')
    setErrorMsg(null)
    setEvaluation(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="font-bold border-2 text-primary border-primary/20 bg-primary/5 uppercase tracking-wider text-[10px] px-2.5 py-0.5">
            <IconCode size={10} className="mr-1" aria-hidden="true" />
            {t('typeLabel')}
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
          {(isExerciseCompleted || passed) && (
            <Badge className="bg-emerald-500 text-white font-bold text-[10px] px-2.5 py-0.5 uppercase tracking-wider">
              <IconCheck size={11} className="mr-1" aria-hidden="true" />
              {tAudio('completed')}
            </Badge>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-balance leading-tight">
          {exercise.title}
        </h1>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Instructions */}
        <div className="lg:col-span-4 space-y-6">
          <div className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.03] to-transparent overflow-hidden">
            <div className="px-5 py-3.5 border-b border-primary/10 bg-primary/[0.03]">
              <h2 className="font-bold text-xs flex items-center gap-2 text-primary uppercase tracking-wider">
                <IconInfoCircle size={14} aria-hidden="true" />
                {tAudio('instructions')}
              </h2>
            </div>
            <div className="px-5 py-4">
              <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert prose-p:leading-relaxed prose-p:text-foreground/80 prose-strong:text-foreground prose-headings:text-foreground prose-headings:font-bold prose-li:text-foreground/80 prose-headings:text-sm">
                <Markdown>{exercise.instructions}</Markdown>
              </div>
            </div>
          </div>

          {isExerciseCompletedSection && (
            <div className="space-y-4">{isExerciseCompletedSection}</div>
          )}
        </div>

        {/* Right: Artifact + Results */}
        <div className="lg:col-span-8">
          <div className="lg:sticky lg:top-6 space-y-4">
            {/* Completion summary */}
            {(isExerciseCompleted || passed) && (
              <div className="rounded-2xl border-2 border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-emerald-500/[0.02] p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                      <IconTrophy size={18} />
                      {tAudio('completedScore')}
                    </h3>
                    {completionDate && (
                      <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60 mt-1">
                        {tAudio('completedOn', {
                          date: new Date(completionDate).toLocaleDateString(undefined, {
                            month: 'long', day: 'numeric', year: 'numeric',
                          }),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black tabular-nums tracking-tight text-emerald-600 dark:text-emerald-400">
                      {Math.round(completionScore)}
                    </span>
                    <span className="text-lg font-bold text-emerald-600/40">/</span>
                    <span className="text-lg font-bold text-emerald-600/60 tabular-nums">100</span>
                  </div>
                </div>
                <p className="text-sm text-emerald-600/80 dark:text-emerald-400/70">
                  {tAudio('exerciseMarkedComplete')}
                </p>
              </div>
            )}

            {/* Rate limit banner */}
            {rateLimited && (
              <div className="rounded-xl border-2 border-amber-500/20 bg-amber-500/[0.05] p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-amber-500/10 p-2">
                    <IconAlertTriangle size={20} className="text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-amber-700 dark:text-amber-400">{t('rateLimited')}</h3>
                  </div>
                </div>
              </div>
            )}

            {/* Evaluating state */}
            {submitState === 'evaluating' && (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
                <IconLoader2 size={16} className="animate-spin text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">{t('evaluating')}</p>
                </div>
              </div>
            )}

            {/* Error */}
            {errorMsg && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {errorMsg}
              </div>
            )}

            {/* Sandboxed iframe */}
            {artifactHtml && (
              <div className="rounded-xl border-2 border-border/50 overflow-hidden bg-white">
                <iframe
                  ref={iframeRef}
                  srcDoc={artifactHtml}
                  sandbox="allow-scripts"
                  className="w-full border-0"
                  style={{ minHeight: '500px' }}
                  title={exercise.title}
                />
              </div>
            )}

            {/* Evaluation result — also shown for a restored prior attempt, whose
                submitState is still 'idle' because nothing was submitted this visit. */}
            {/* One result card across every engine. This block used to be a
                near-copy of ExerciseResultSummary that printed the score over
                the PASS MARK, twice: "62 / 70" reads as 89% when 62 is a fail. */}
            {evaluation && submitState !== 'evaluating' && (
              <div className="space-y-4">
                <ExerciseResultSummary
                  score={evaluation.score}
                  passed={evaluation.passed}
                  feedback={evaluation.feedback}
                  strengths={evaluation.strengths}
                  improvements={evaluation.improvements}
                  // The API response carries its own threshold; the prop is the
                  // fallback for a restored attempt that predates that field.
                  passingScore={evaluation.passingScore ?? passingScore}
                />

                {!evaluation.passed && !rateLimited && (
                  <Button
                    onClick={handleTryAgain}
                    className="w-full gap-2.5 h-11 text-sm font-semibold tracking-wide"
                  >
                    {t('tryAgain')}
                    <IconArrowRight size={16} className="ml-auto opacity-60" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
