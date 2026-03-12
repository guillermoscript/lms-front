'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  IconTarget,
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
}: ArtifactExerciseProps) {
  const t = useTranslations('exercises.artifact')
  const tAudio = useTranslations('exercises.audio')
  const tGamification = useTranslations('gamification')

  const config = exercise.exercise_config ?? {}
  const artifactHtml = config.artifact_html ?? ''

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null)
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

            {/* Evaluation result */}
            {evaluation && submitState === 'done' && (
              <div className="rounded-xl border bg-card p-5 space-y-5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <IconSparkles size={16} className="text-primary" />
                  {tAudio('aiFeedback')}
                </h3>

                {/* Score */}
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-3">
                    <div className="flex items-baseline gap-1">
                      <span className={cn(
                        'text-4xl font-black tabular-nums tracking-tight',
                        evaluation.passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-foreground'
                      )}>
                        {evaluation.score}
                      </span>
                      <span className="text-lg font-bold text-muted-foreground/60">/</span>
                      <span className="text-lg font-bold text-primary tabular-nums">{evaluation.passingScore}</span>
                    </div>
                  </div>
                  <Badge className={cn(
                    'font-bold text-xs px-3 py-1',
                    evaluation.passed
                      ? 'bg-emerald-500 text-white'
                      : 'bg-amber-500/10 text-amber-700 border-amber-500/30'
                  )}>
                    {evaluation.passed ? t('passed') : t('failed')}
                  </Badge>
                </div>

                {/* Feedback */}
                <p className="text-sm text-foreground/80 leading-relaxed">{evaluation.feedback}</p>

                {/* Strengths */}
                {evaluation.strengths.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-2">
                      {t('strengths')}
                    </p>
                    <ul className="space-y-1.5">
                      {evaluation.strengths.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                          <span className="mt-0.5 shrink-0 text-emerald-500">+</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Improvements */}
                {evaluation.improvements.length > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                      {t('improvements')}
                    </p>
                    <ul className="space-y-1.5">
                      {evaluation.improvements.map((imp, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                          <span className="mt-0.5 shrink-0 text-amber-500">-</span>
                          {imp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Try again */}
                {!evaluation.passed && !rateLimited && (
                  <div className="rounded-2xl border-2 border-primary/15 bg-gradient-to-br from-primary/[0.04] to-primary/[0.01] p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tabular-nums tracking-tight text-foreground">
                          {evaluation.score}
                        </span>
                        <span className="text-sm font-bold text-muted-foreground/60">/</span>
                        <span className="text-sm font-bold text-primary tabular-nums">{evaluation.passingScore}</span>
                      </div>
                      <div className="rounded-full border-2 border-primary/20 bg-primary/5 p-2">
                        <IconTarget size={18} className="text-primary" />
                      </div>
                    </div>
                    <Button
                      onClick={handleTryAgain}
                      className="w-full gap-2.5 h-11 text-sm font-bold tracking-wide"
                    >
                      {t('tryAgain')}
                      <IconArrowRight size={16} className="ml-auto opacity-60" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
