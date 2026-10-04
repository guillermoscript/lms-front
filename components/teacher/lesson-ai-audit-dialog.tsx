'use client'

/**
 * "Why was this lesson granted?" — a teacher opens this from a student's
 * completed AI-tutor lesson and sees the tutor's feedback plus the
 * verifier's per-requirement check, read from `lessons_ai_task_messages`
 * (#805, follow-up to #804).
 *
 * Lazy: nothing is fetched until the dialog opens, so it costs the Students
 * tab nothing to render one of these per completed lesson row.
 */

import { useState } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { IconRobot, IconLoader2, IconAlertCircle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface LessonAiAuditDialogProps {
  lessonId: number
  studentId: string
  lessonTitle: string
}

interface AuditCompletion {
  feedback?: string
  requirementsCheck?: string
  completedAt: string
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'done'; completion: AuditCompletion | null }

export function LessonAiAuditDialog({ lessonId, studentId, lessonTitle }: LessonAiAuditDialogProps) {
  const t = useTranslations('dashboard.teacher.manageCourse.studentList.aiAudit')
  const format = useFormatter()
  const [state, setState] = useState<FetchState>({ status: 'idle' })

  const load = async () => {
    setState({ status: 'loading' })
    try {
      const res = await fetch(
        `/api/teacher/lessons/${lessonId}/ai-task-audit?studentId=${encodeURIComponent(studentId)}`
      )
      if (!res.ok) throw new Error(await res.text())
      const data = (await res.json()) as { completion: AuditCompletion | null }
      setState({ status: 'done', completion: data.completion })
    } catch (err) {
      console.error('Failed to load AI task audit:', err)
      setState({ status: 'error' })
    }
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && state.status === 'idle') load()
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={t('viewButton', { title: lessonTitle })}
            title={t('viewButton', { title: lessonTitle })}
          />
        }
      >
        <IconRobot className="size-3.5" aria-hidden />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{lessonTitle}</DialogTitle>
        </DialogHeader>

        {state.status === 'idle' || state.status === 'loading' ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <IconLoader2 className="size-4 animate-spin" aria-hidden />
            {t('loading')}
          </div>
        ) : state.status === 'error' ? (
          <div className="flex items-center gap-2 py-6 text-sm text-destructive">
            <IconAlertCircle className="size-4 shrink-0" aria-hidden />
            {t('error')}
          </div>
        ) : state.completion ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">
              {t('completedOn', {
                date: format.dateTime(new Date(state.completion.completedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }),
              })}
            </p>
            {state.completion.feedback && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('feedback')}
                </h4>
                <p className="whitespace-pre-wrap">{state.completion.feedback}</p>
              </div>
            )}
            {state.completion.requirementsCheck && (
              <div>
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('requirementsCheck')}
                </h4>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {state.completion.requirementsCheck}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="py-6 text-sm text-muted-foreground">{t('notFound')}</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
