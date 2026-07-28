'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  IconCheck,
  IconX,
  IconLoader2,
  IconExternalLink,
  IconRefresh,
  IconTarget,
} from '@tabler/icons-react'
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
  type ClientCheckpointQuestion,
} from '@/lib/checkpoints/types'
import type { LessonCheckpointClientData } from '@/lib/checkpoints/load'

interface CheckpointExerciseRendererProps {
  checkpoint: LessonCheckpointClientData
}

type AttemptFailure = {
  ok: false
  status: number
  notCompleted?: boolean
  accessDenied?: boolean
  accessSuspended?: boolean
  error?: string
}

type AttemptResponse = { ok: true; data: CheckpointAttemptResult } | AttemptFailure

/**
 * The route's access refusals (issue #532) carry flags rather than only a
 * message, so the student reads translated copy instead of the server's raw
 * English — and a school-wide suspension reads differently from "you never
 * bought this course", which is the distinction #494 exists to make.
 */
function attemptErrorKey(res: AttemptFailure): 'accessSuspended' | 'accessDenied' | null {
  if (res.accessSuspended) return 'accessSuspended'
  if (res.accessDenied) return 'accessDenied'
  return null
}

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
        accessDenied: payload?.accessDenied === true,
        accessSuspended: payload?.accessSuspended === true,
        error: typeof payload?.error === 'string' ? payload.error : undefined,
      }
    }
    const data = (await res.json()) as CheckpointAttemptResult
    return { ok: true, data }
  } catch {
    return { ok: false, status: 0 }
  }
}

/**
 * Rebuild a displayable result from the attempt persisted in
 * `lesson_checkpoint_attempts`, so a student who reloads the lesson still sees
 * the AI's feedback and their own answer rather than only a score badge.
 *
 * `attemptId` is not part of the stored summary and nothing in the display uses
 * it. `canRetryAi` is the checkpoint-level half of the server's gate — the plan
 * and monthly quotas stay server-enforced and surface as `aiUnavailable` on the
 * next submit, so this is an affordance hint, never the authority.
 */
function restoredResult(checkpoint: LessonCheckpointClientData): CheckpointAttemptResult | null {
  const attempt = checkpoint.latestAttempt
  if (!attempt) return null
  return {
    attemptId: 0,
    attemptNumber: attempt.attemptNumber,
    evaluatorType: attempt.evaluatorType,
    completed: attempt.completed,
    passed: attempt.passed,
    score: attempt.score,
    feedback: attempt.feedback,
    nextStepHint: attempt.nextStepHint,
    perQuestion: attempt.perQuestion,
    aiUnavailable: attempt.aiUnavailable,
    canRetryAi:
      attempt.evaluatorType === 'ai' &&
      attempt.passed === false &&
      checkpoint.attemptCount < checkpoint.maxAiAttempts,
  }
}

/**
 * Render the correct answer the way the student saw the options, not the way it
 * is stored. `correctValue` is an index for multiple choice and a boolean for
 * true/false, so printing it raw told a student "Incorrect — 1".
 */
function correctValueLabel(
  question: ClientCheckpointQuestion,
  value: string | number | boolean,
  t: ReturnType<typeof useTranslations<'components.checkpoints'>>
): string {
  if (question.type === 'multiple_choice' && typeof value === 'number') {
    return question.options?.[value] ?? String(value)
  }
  if (typeof value === 'boolean') return value ? t('trueLabel') : t('falseLabel')
  return String(value)
}

/**
 * The student's own submitted text, shown alongside the feedback it earned.
 *
 * Deliberately borderless: with a border and a pale fill it was visually the
 * same object as the retry Textarea directly below it, so the read-only record
 * of a past answer read as an editable field.
 */
function SubmittedAnswer({ text }: { text: string }) {
  const t = useTranslations('components.checkpoints')
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{t('yourAnswer')}</p>
      <p className="max-w-[68ch] whitespace-pre-wrap break-words rounded-lg bg-muted/60 p-3 text-sm">
        {text}
      </p>
    </div>
  )
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

function ResultAlert({
  result,
  maxAttempts,
}: {
  result: CheckpointAttemptResult
  /** Only meaningful for AI-graded checkpoints that allow more than one try. */
  maxAttempts?: number
}) {
  const t = useTranslations('components.checkpoints')
  const positive = result.passed !== false
  const showAttempts =
    result.evaluatorType === 'ai' && maxAttempts !== undefined && maxAttempts > 1
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
      {/* Wraps: "Puntuación: 64 / 100" plus "Intento 1 de 3" runs past 320px. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
        {positive ? (
          <IconCheck className="size-4 shrink-0" />
        ) : (
          <IconTarget className="size-4 shrink-0" />
        )}
        {/* Same grammar as the standalone exercise card: a score out of 100,
            never over the pass mark. */}
        {result.score !== null
          ? t('scoreOutOf', { score: Math.round(result.score) })
          : result.passed
            ? t('passed')
            : t('notPassed')}
        {showAttempts && (
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {t('attemptCounter', { attempt: result.attemptNumber, total: maxAttempts })}
          </span>
        )}
      </div>
      {result.feedback && (
        <p className="max-w-[68ch] break-words text-foreground/80">{result.feedback}</p>
      )}
      {result.nextStepHint && (
        <p className="max-w-[68ch] break-words text-xs text-muted-foreground">
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
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>(
    () => checkpoint.latestAttempt?.submittedAnswers ?? {}
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Seed from the provider: this form remounts whenever the provider updates
  // (the MDX tree is recreated), so local-only state would lose the feedback.
  // Falling back to the persisted attempt is what makes the graded answers and
  // per-question explanations survive a page reload, not just a remount.
  const [result, setResult] = useState<CheckpointAttemptResult | null>(
    () => ctx?.getResult(checkpoint.id) ?? restoredResult(checkpoint)
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
      const errorKey = attemptErrorKey(res)
      setError(errorKey ? t(errorKey) : (res.error ?? t('genericError')))
      return
    }
    setResult(res.data)
    recordResult?.(checkpoint.id, res.data, { answers })
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
                  // items-start, not items-center: a two-line option pushed the
                  // radio to the vertical middle of the wrapped text. py-1 also
                  // lifts the tap target off the 20px text line height.
                  <label
                    key={optIdx}
                    className="flex items-start gap-2 py-1 text-sm cursor-pointer"
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
                className="flex h-10 w-full rounded-md border border-input bg-input/20 px-2 text-base outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:text-sm"
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
                    <> — {correctValueLabel(q, pq.correctValue, t)}</>
                  )}
                  {pq.explanation && <span className="block text-muted-foreground">{pq.explanation}</span>}
                </span>
              </p>
            )}
          </div>
        )
      })}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {result && <ResultAlert result={result} maxAttempts={checkpoint.maxAiAttempts} />}

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
    () => ctx?.getResult(checkpoint.id) ?? restoredResult(checkpoint)
  )
  // The graded answer comes from the attempt row, not from `text` — this form
  // remounts on every provider update, so local input state is already gone by
  // the time the feedback renders, and is empty outright after a reload.
  const submittedText = result === null ? null : (checkpoint.latestAttempt?.submittedText ?? null)

  async function handleSubmit() {
    if (!text.trim()) return
    setSubmitting(true)
    setError(null)
    const res = await postAttempt(checkpoint.id, { kind: 'text', text })
    setSubmitting(false)
    if (!res.ok) {
      const errorKey = attemptErrorKey(res)
      setError(errorKey ? t(errorKey) : (res.error ?? t('genericError')))
      return
    }
    setResult(res.data)
    recordResult?.(checkpoint.id, res.data, { text })
  }

  function handleRetry() {
    setResult(null)
    setError(null)
  }

  const canRetry = result?.canRetryAi === true

  return (
    <div className="space-y-3">
      {/* Answer, then the grade for that answer, then the retry field. The
          empty Textarea used to sit between the two, so the feedback was
          separated from the text it was feedback about. */}
      {submittedText && <SubmittedAnswer text={submittedText} />}

      {result && <ResultAlert result={result} maxAttempts={checkpoint.maxAiAttempts} />}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result === null || canRetry ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('textPlaceholder')}
          disabled={submitting}
          rows={5}
          // 16px on phones: iOS Safari zooms the whole page when a focused
          // field is under 16px, which throws the student out of the lesson.
          className="text-base sm:text-sm"
        />
      ) : null}

      <div>
        {result === null ? (
          <Button
            size="sm"
            className="h-9 sm:h-6"
            disabled={!text.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting && <IconLoader2 className="size-3.5 animate-spin" />}
            {submitting ? t('submitting') : t('submit')}
          </Button>
        ) : canRetry ? (
          <Button
            size="sm"
            variant="outline"
            className="h-9 sm:h-6"
            disabled={submitting || !text.trim()}
            onClick={handleSubmit}
          >
            {submitting && <IconLoader2 className="size-3.5 animate-spin" />}
            <IconRefresh className="size-3.5" />
            {t('retry')}
          </Button>
        ) : null}
      </div>
      {result && !canRetry && (
        <div>
          <Button size="sm" variant="ghost" className="h-9 sm:h-6" onClick={handleRetry}>
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
  const [result, setResult] = useState<CheckpointAttemptResult | null>(
    () => ctx?.getResult(checkpoint.id) ?? restoredResult(checkpoint)
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
      const errorKey = attemptErrorKey(res)
      setError(errorKey ? t(errorKey) : (res.error ?? t('genericError')))
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
