'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconCircleCheck, IconFlask, IconLoader2 } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { evalRequest } from './types'

/**
 * On a teacher-reviewed exam submission: keep the answers and the teacher's
 * final points as a grading test, so the AI grader is checked against them.
 */
export function SaveSubmissionAsTest({ examId, submissionId, submittedAt }: { examId: number; submissionId: number; submittedAt: string }) {
  const t = useTranslations('dashboard.teacher.aiEvals.fromSubmission')
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setState('saving')
    setError(null)
    const res = await evalRequest(`/api/teacher/evals/exam/${examId}/cases/from-submission`, {
      method: 'POST',
      body: JSON.stringify({
        submission_id: submissionId,
        name: t('caseName', { date: new Date(submittedAt).toLocaleDateString() }),
      }),
    })
    if (res.ok) return setState('saved')
    setState('idle')
    const known = ['case_limit', 'not_reviewed', 'no_ai_questions', 'no_answers', 'answers_too_large']
    setError(t(`errors.${res.code && known.includes(res.code) ? res.code : 'saveFailed'}`))
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
          <IconFlask aria-hidden="true" className="h-5 w-5 text-brand-text" />
        </div>
        <div>
          <p className="text-sm font-semibold">{t('title')}</p>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
          {error && (
            <p role="alert" className="mt-1 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </div>
      {state === 'saved' ? (
        <p role="status" className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-success">
          <IconCircleCheck aria-hidden="true" className="h-4 w-4" />
          {t('saved')}
        </p>
      ) : (
        <Button type="button" variant="outline" className="shrink-0 gap-2" onClick={save} disabled={state === 'saving'}>
          {state === 'saving' && <IconLoader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
          {t('button')}
        </Button>
      )}
    </div>
  )
}
