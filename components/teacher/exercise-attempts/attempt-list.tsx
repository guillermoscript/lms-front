'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconCircleCheck, IconFlask, IconLoader2, IconRobot, IconUser } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { evalRequest } from '@/components/teacher/ai-evals/types'

export interface ExerciseAttempt {
  id: number
  studentName: string
  attemptNumber: number | null
  createdAt: string
  aiScore: number | null
  aiPassed: boolean
  aiFeedback: string | null
  /** null for attempts graded before answers were stored. */
  answer: string | null
  teacherScore: number | null
  teacherPassed: boolean | null
  teacherFeedback: string | null
  reviewedAt: string | null
}

export function ExerciseAttemptList({
  exerciseId,
  passingScore,
  attempts,
  limited,
}: {
  exerciseId: number
  passingScore: number
  attempts: ExerciseAttempt[]
  limited: boolean
}) {
  const t = useTranslations('dashboard.teacher.exerciseAttempts')
  if (attempts.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">{t('empty')}</p>
  }
  return (
    <div className="space-y-4">
      {limited && <p className="text-xs text-muted-foreground">{t('limited', { count: attempts.length })}</p>}
      <ul className="space-y-4">
        {attempts.map((a) => (
          <AttemptCard key={a.id} exerciseId={exerciseId} passingScore={passingScore} attempt={a} />
        ))}
      </ul>
    </div>
  )
}

function ScoreBadge({ score, passed }: { score: number | null; passed: boolean | null }) {
  const t = useTranslations('dashboard.teacher.exerciseAttempts')
  if (score === null) return <Badge variant="outline">{t('noScore')}</Badge>
  return (
    <Badge variant="outline" className={passed ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive'}>
      {Math.round(Number(score))} · {passed ? t('passed') : t('failed')}
    </Badge>
  )
}

function AttemptCard({ exerciseId, passingScore, attempt }: { exerciseId: number; passingScore: number; attempt: ExerciseAttempt }) {
  const t = useTranslations('dashboard.teacher.exerciseAttempts')
  const [review, setReview] = useState({
    score: attempt.teacherScore,
    passed: attempt.teacherPassed,
    feedback: attempt.teacherFeedback,
  })
  const [editing, setEditing] = useState(false)
  const [scoreInput, setScoreInput] = useState(String(Math.round(Number(attempt.teacherScore ?? attempt.aiScore ?? 0))))
  const [feedbackInput, setFeedbackInput] = useState(attempt.teacherFeedback ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testState, setTestState] = useState<'idle' | 'saving' | 'saved'>('idle')

  const parsedScore = Number(scoreInput)
  const scoreValid = scoreInput.trim() !== '' && Number.isInteger(parsedScore) && parsedScore >= 0 && parsedScore <= 100
  const reviewed = review.score !== null
  const scoreId = `attempt-${attempt.id}-score`
  const feedbackId = `attempt-${attempt.id}-feedback`

  const saveGrade = async () => {
    if (!scoreValid) return
    setSaving(true)
    setError(null)
    const res = await evalRequest<{ review: { teacher_score: number; teacher_passed: boolean; teacher_feedback: string | null } }>(
      `/api/teacher/exercises/${exerciseId}/attempts/${attempt.id}/review`,
      { method: 'POST', body: JSON.stringify({ score: parsedScore, feedback: feedbackInput }) }
    )
    setSaving(false)
    if (!res.ok || !res.data) return setError(t('errors.saveGrade'))
    setReview({ score: res.data.review.teacher_score, passed: res.data.review.teacher_passed, feedback: res.data.review.teacher_feedback })
    setEditing(false)
    setTestState('idle')
  }

  const saveAsTest = async () => {
    setTestState('saving')
    setError(null)
    const res = await evalRequest(`/api/teacher/evals/exercise/${exerciseId}/cases/from-attempt`, {
      method: 'POST',
      body: JSON.stringify({
        evaluation_id: attempt.id,
        name: t('caseName', { date: new Date(attempt.createdAt).toLocaleDateString() }),
      }),
    })
    if (res.ok) return setTestState('saved')
    setTestState('idle')
    const known = ['case_limit', 'answer_too_large', 'no_answer', 'not_reviewed']
    setError(t(`errors.${res.code && known.includes(res.code) ? res.code : 'saveTest'}`))
  }

  return (
    <li className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{attempt.studentName}</p>
          <p className="text-xs text-muted-foreground">
            {attempt.attemptNumber !== null ? `${t('attempt', { number: attempt.attemptNumber })} · ` : ''}
            {new Date(attempt.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <IconRobot aria-hidden="true" className="h-3.5 w-3.5" />
            {t('aiGrade')}
          </span>
          <ScoreBadge score={attempt.aiScore} passed={attempt.aiPassed} />
          {reviewed && (
            <>
              <span className="ms-2 inline-flex items-center gap-1 text-muted-foreground">
                <IconUser aria-hidden="true" className="h-3.5 w-3.5" />
                {t('teacherGrade')}
              </span>
              <ScoreBadge score={review.score} passed={review.passed} />
            </>
          )}
        </div>
      </div>

      {attempt.answer ? (
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-sm">{attempt.answer}</div>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{t('noAnswer')}</p>
      )}

      {attempt.aiFeedback && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('aiFeedback')}</p>
          <p className="text-sm">{attempt.aiFeedback}</p>
        </div>
      )}

      {reviewed && !editing && review.feedback && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{t('teacherFeedback')}</p>
          <p className="text-sm">{review.feedback}</p>
        </div>
      )}

      {editing ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={scoreId}>{t('scoreLabel')}</Label>
              <Input
                id={scoreId}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                className="w-24"
                value={scoreInput}
                onChange={(e) => setScoreInput(e.target.value)}
                aria-invalid={!scoreValid}
              />
            </div>
            {scoreValid && (
              <p className="pb-2 text-xs text-muted-foreground">
                {parsedScore >= passingScore ? t('willPass', { passingScore }) : t('willFail', { passingScore })}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={feedbackId}>{t('feedbackLabel')}</Label>
            <Textarea id={feedbackId} rows={3} maxLength={5000} value={feedbackInput} onChange={(e) => setFeedbackInput(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">{t('overrideNote')}</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={saveGrade} disabled={saving || !scoreValid} className="gap-2">
              {saving && <IconLoader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
              {t('saveGrade')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              {t('cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
            {reviewed ? t('changeGrade') : t('regrade')}
          </Button>
          {reviewed && attempt.answer && (
            testState === 'saved' ? (
              <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-success">
                <IconCircleCheck aria-hidden="true" className="h-4 w-4" />
                {t('savedAsTest')}
              </p>
            ) : (
              <Button type="button" size="sm" variant="outline" className="gap-2" onClick={saveAsTest} disabled={testState === 'saving'}>
                {testState === 'saving' ? (
                  <IconLoader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
                ) : (
                  <IconFlask aria-hidden="true" className="h-4 w-4" />
                )}
                {t('saveAsTest')}
              </Button>
            )
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
