'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconCheck, IconX, IconLoader2, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useCheckpoints } from './checkpoints-provider'
import {
  CLOSED_EXERCISE_TYPES,
  EXTERNAL_EXERCISE_TYPES,
  type CheckpointAnswer,
  type CheckpointAttemptResult,
} from '@/lib/checkpoints/types'
import type { LessonCheckpointClientData } from '@/lib/checkpoints/load'

interface CheckpointExerciseRendererProps {
  checkpoint: LessonCheckpointClientData
}

type AttemptResponse =
  | { ok: true; data: CheckpointAttemptResult }
  | { ok: false; status: number; notCompleted?: boolean; error?: string }

async function postAttempt(checkpointId: number, body: unknown): Promise<AttemptResponse> {
  try {
    const res = await fetch(`/api/lesson-checkpoints/${checkpointId}/attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const payload = await res.json().catch(() => null)
      return {
        ok: false,
        status: res.status,
        notCompleted: payload?.notCompleted === true,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
      }
    }
    const data = (await res.json()) as CheckpointAttemptResult
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0 }
  }
}

export function CheckpointExerciseRenderer({ checkpoint }: CheckpointExerciseRendererProps) {
  const { exercise } = checkpoint
  const isClosed =
    (CLOSED_EXERCISE_TYPES as readonly string[]).includes(exercise.exercise_type) &&
    !!exercise.questions?.length
  const isExternal = (EXTERNAL_EXERCISE_TYPES as readonly string[]).includes(exercise.exercise_type)

  if (isExternal) return <ExternalCheckpointForm checkpoint={checkpoint} />
  if (isClosed) return <ClosedCheckpointForm checkpoint={checkpoint} />
  return <TextCheckpointForm checkpoint={checkpoint} />
}

function ResultAlert({ result }: { result: CheckpointAttemptResult }) {
  const t = useTranslations('components.checkpoints')
  const positive = result.passed !== false
  return (
    <div
      className={cn(
        'rounded-lg border p-3 text-sm space-y-1.5',
        positive
          ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
          : 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
      )}
      role="status"
    >
      <div className="flex items-center gap-2 font-semibold">
        {positive ? <IconCheck className="size-4" /> : <IconX className="size-4" />}
        {result.score !== null
          ? t('scoreLabel', { score: Math.round(result.score) })
          : result.passed
            ? t('passed')
            : t('notPassed')}
      </div>
      {result.feedback && <p className="text-foreground/80">{result.feedback}</p>}
      {result.nextStepHint && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t('nextStep')}:</span> {result.nextStepHint}
        </p>
      )}
      {result.aiUnavailable && (
        <p className="text-xs text-muted-foreground">{t('aiUnavailable')}</p>
      )}
    </div>
  )
}

function ClosedCheckpointForm({ checkpoint }: CheckpointExerciseRendererProps) {
  const t = useTranslations('components.checkpoints')
  const ctx = useCheckpoints()
  const recordResult = ctx?.recordResult
  const questions = checkpoint.exercise.questions ?? []
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Seed from the provider: this form remounts whenever the provider updates
  // (the MDX tree is recreated), so local-only state would lose the feedback.
  const [result, setResult] = useState<CheckpointAttemptResult | null>(
    () => ctx?.getResult(checkpoint.id) ?? null
  )

  const allAnswered = questions.every((q) => answers[q.id] !== undefined)

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    const payload: CheckpointAnswer[] = questions.map((q) => ({
      questionId: q.id,
      value: answers[q.id],
    }))
    const res = await postAttempt(checkpoint.id, { kind: 'answers', answers: payload })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error ?? t('genericError'))
      return
    }
    setResult(res.data)
    recordResult?.(checkpoint.id, res.data)
  }

  function handleRetry() {
    setAnswers({})
    setResult(null)
    setError(null)
  }

  const perQuestionById = new Map((result?.perQuestion ?? []).map((pq) => [pq.questionId, pq]))

  return (
    <div className="space-y-4">
      {questions.map((q, idx) => {
        const pq = perQuestionById.get(q.id)
        const showFeedback = result !== null && pq !== undefined
        return (
          <div key={q.id} className="space-y-2">
            <p className="text-sm font-medium">
              {idx + 1}. {q.prompt}
            </p>
            {q.type === 'multiple_choice' && (
              <RadioGroup
                value={typeof answers[q.id] === 'number' ? String(answers[q.id]) : ''}
                onValueChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: Number(v) }))}
                disabled={result !== null}
              >
                {(q.options ?? []).map((opt, optIdx) => (
                  <label
                    key={optIdx}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <RadioGroupItem value={String(optIdx)} />
                    {opt}
                  </label>
                ))}
              </RadioGroup>
            )}
            {q.type === 'true_false' && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={answers[q.id] === true ? 'default' : 'outline'}
                  disabled={result !== null}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: true }))}
                >
                  {t('trueLabel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={answers[q.id] === false ? 'default' : 'outline'}
                  disabled={result !== null}
                  onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: false }))}
                >
                  {t('falseLabel')}
                </Button>
              </div>
            )}
            {q.type === 'fill_in_the_blank' && (
              <input
                type="text"
                className="flex h-8 w-full rounded-md border border-input bg-input/20 px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder={t('fillBlankPlaceholder')}
                value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                disabled={result !== null}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
              />
            )}
            {showFeedback && (
              <p
                className={cn(
                  'flex items-start gap-1.5 text-xs',
                  pq.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                )}
              >
                {pq.correct ? (
                  <IconCheck className="size-3.5 shrink-0 mt-0.5" />
                ) : (
                  <IconX className="size-3.5 shrink-0 mt-0.5" />
                )}
                <span>
                  {pq.correct ? t('correct') : t('incorrect')}
                  {!pq.correct && pq.correctValue !== null && (
                    <> — {String(pq.correctValue)}</>
                  )}
                  {pq.explanation && <span className="block text-muted-foreground">{pq.explanation}</span>}
                </span>
              </p>
            )}
          </div>
        )
      })}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && <ResultAlert result={result} />}

      <div>
        {result === null ? (
          <Button size="sm" disabled={!allAnswered || submitting} onClick={handleSubmit}>
            {submitting && <IconLoader2 className="size-3.5 animate-spin" />}
            {submitting ? t('submitting') : t('submit')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={handleRetry}>
            <IconRefresh className="size-3.5" />
            {t('retry')}
          </Button>
        )}
      </div>
    </div>
  )
}

function TextCheckpointForm({ checkpoint }: CheckpointExerciseRendererProps) {
  const t = useTranslations('components.checkpoints')
  const ctx = useCheckpoints()
  const recordResult = ctx?.recordResult
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckpointAttemptResult | null>(
    () => ctx?.getResult(checkpoint.id) ?? null
  )

  async function handleSubmit() {
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    const res = await postAttempt(checkpoint.id, { kind: 'text', text })
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error ?? t('genericError'))
      return
    }
    setResult(res.data)
    recordResult?.(checkpoint.id, res.data)
  }

  function handleRetry() {
    setResult(null)
    setError(null)
  }

  const canRetry = result?.canRetryAi === true

  return (
    <div className="space-y-3">
      {result === null || canRetry ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('textPlaceholder')}
          disabled={submitting}
          rows={5}
        />
      ) : null}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && <ResultAlert result={result} />}

      <div>
        {result === null ? (
          <Button size="sm" disabled={!text.trim() || submitting} onClick={handleSubmit}>
            {submitting && <IconLoader2 className="size-3.5 animate-spin" />}
            {submitting ? t('submitting') : t('submit')}
          </Button>
        ) : canRetry ? (
          <Button size="sm" variant="outline" disabled={submitting || !text.trim()} onClick={handleSubmit}>
            {submitting && <IconLoader2 className="size-3.5 animate-spin" />}
            <IconRefresh className="size-3.5" />
            {t('retry')}
          </Button>
        ) : null}
      </div>
      {result && !canRetry && (
        <div>
          <Button size="sm" variant="ghost" onClick={handleRetry}>
            {t('review')}
          </Button>
        </div>
      )}
    </div>
  )
}

function ExternalCheckpointForm({ checkpoint }: CheckpointExerciseRendererProps) {
  const t = useTranslations('components.checkpoints')
  const ctx = useCheckpoints()
  const [syncing, setSyncing] = useState(false)
  const [notCompleted, setNotCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CheckpointAttemptResult | null>(() =>
    ctx?.getResult(checkpoint.id) ??
    (checkpoint.latestAttempt
      ? {
          attemptId: 0,
          attemptNumber: checkpoint.latestAttempt.attemptNumber,
          evaluatorType: checkpoint.latestAttempt.evaluatorType,
          completed: checkpoint.latestAttempt.completed,
          passed: checkpoint.latestAttempt.passed,
          score: checkpoint.latestAttempt.score,
        }
      : null)
  )

  const exerciseHref = ctx
    ? `/dashboard/student/courses/${ctx.courseId}/exercises/${checkpoint.exercise.id}`
    : null

  async function handleSync() {
    setSyncing(true)
    setError(null)
    setNotCompleted(false)
    const res = await postAttempt(checkpoint.id, { kind: 'external' })
    setSyncing(false)
    if (!res.ok) {
      if (res.status === 409 && res.notCompleted) {
        setNotCompleted(true)
        return
      }
      setError(res.error ?? t('genericError'))
      return
    }
    setResult(res.data)
    ctx?.recordResult(checkpoint.id, res.data)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('externalPrompt')}</p>

      {exerciseHref && (
        <Link href={exerciseHref}>
          <Button size="sm" variant="outline">
            <IconExternalLink className="size-3.5" />
            {t('externalLinkLabel')}
          </Button>
        </Link>
      )}

      {notCompleted && <p className="text-xs text-amber-600 dark:text-amber-400">{t('externalNotCompleted')}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && <ResultAlert result={result} />}

      <div>
        <Button size="sm" disabled={syncing} onClick={handleSync}>
          {syncing && <IconLoader2 className="size-3.5 animate-spin" />}
          {syncing ? t('externalSyncing') : t('externalSyncLabel')}
        </Button>
      </div>
    </div>
  )
}
