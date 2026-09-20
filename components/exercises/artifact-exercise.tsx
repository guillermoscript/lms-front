'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'
import ExerciseBrief from '@/components/exercises/exercise-brief'
import ExerciseHeader from '@/components/exercises/exercise-header'
import ExerciseWorkspace, { initialWorkspacePanel } from '@/components/exercises/exercise-workspace'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconLoader2, IconAlertTriangle, IconArrowRight } from '@tabler/icons-react'

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
  const tWorkspace = useTranslations('exercises.workspace')
  const tGamification = useTranslations('gamification')

  const config = exercise.exercise_config ?? {}
  const artifactHtml = config.artifact_html ?? ''

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [submitState, setSubmitState] = useState<SubmitState>('idle')
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(initialEvaluation)
  const [passed, setPassed] = useState<boolean>(isExerciseCompleted)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [rateLimited, setRateLimited] = useState(false)
  /** Bumped on every fresh grade so the workspace can surface the result panel. */
  const [gradedNonce, setGradedNonce] = useState(0)

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
      setGradedNonce((n) => n + 1)

      // Send feedback back to iframe
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'FEEDBACK', payload: result },
        '*'
      )

      if (result.passed) {
        toast.success(tGamification('xpAwarded.exercise_completion'))
      }
    } catch (err) {
      console.error('Artifact evaluation error:', err)
      setErrorMsg(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.')
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

  const taskPanel = (
    <div className="space-y-4">
      {rateLimited && (
        <p className="flex items-start gap-2 text-sm font-medium text-warning">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('rateLimited')}
        </p>
      )}

      {submitState === 'evaluating' && (
        <p className="flex items-center gap-2.5 text-sm font-medium" role="status">
          <IconLoader2
            size={16}
            className="shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            aria-hidden="true"
          />
          {t('evaluating')}
        </p>
      )}

      {errorMsg && (
        <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
          <IconAlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {errorMsg}
        </p>
      )}

      {artifactHtml && (
        // The srcDoc is authored as a light-mode document, so the frame keeps a
        // white backing in both themes rather than showing a dark seam round it.
        <div className="overflow-hidden rounded-card bg-white ring-1 ring-foreground/10">
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
    </div>
  )

  // One result card across every engine. This block used to be a near-copy of
  // ExerciseResultSummary that printed the score over the PASS MARK, alongside
  // a second trophy card printing a *different* score from exercise_completions.
  const resultPanel =
    evaluation && submitState !== 'evaluating' ? (
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
          <Button onClick={handleTryAgain} size="lg" className="h-11 w-full gap-2 text-sm sm:w-auto sm:px-6">
            {t('tryAgain')}
            <IconArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
      </div>
    ) : undefined

  return (
    <div className="lg:h-full">
      <ExerciseWorkspace
        header={
          <ExerciseHeader
            typeLabel={t('typeLabel')}
            title={exercise.title}
            difficulty={exercise.difficulty_level}
            timeLimit={exercise.time_limit}
            completed={isExerciseCompleted || passed}
          />
        }
        brief={<ExerciseBrief instructions={exercise.instructions} />}
        resultFirst={Boolean(resultPanel)}
        task={taskPanel}
        taskLabel={tWorkspace('task')}
        result={resultPanel}
        resultPassed={evaluation?.passed}
        related={isExerciseCompletedSection}
        initialPanel={initialWorkspacePanel({
          hasResult: Boolean(resultPanel),
          passed: evaluation?.passed,
          attempted: isExerciseCompleted || Boolean(initialEvaluation),
        })}
        revealResultNonce={gradedNonce}
      />
    </div>
  )
}
