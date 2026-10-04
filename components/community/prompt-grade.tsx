'use client'

import { useSyncExternalStore } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { IconCalendarDue, IconMessage2Check } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { dueState, type ViewerPromptGrade } from '@/lib/community/prompt-grades'

// A minute-resolution clock: stable between renders, as useSyncExternalStore
// requires, and fresh enough for a "due in N days" label.
const subscribeNever = () => () => {}
const readNow = () => Math.floor(Date.now() / 60_000) * 60_000
const readNoNow = () => null

/**
 * "Due in 3 days" / "Due today" / "Past due" on a graded prompt (#873). The
 * relative label needs the clock, so it appears after mount; the server
 * renders the absolute date, which also stays as the tooltip.
 */
export function PromptDueBadge({ dueAt, className }: { dueAt: string | null | undefined; className?: string }) {
  const t = useTranslations('community.promptGrade')
  const format = useFormatter()
  // The clock only on the client, after hydration (the server has no "now"
  // that matches the viewer's).
  const now = useSyncExternalStore(subscribeNever, readNow, readNoNow)

  if (!dueAt) return null
  const date = format.dateTime(new Date(dueAt), { dateStyle: 'medium' })
  const state = now === null ? null : dueState(dueAt, now)

  const label =
    state === null || state.kind === 'none'
      ? t('dueOn', { date })
      : state.kind === 'overdue'
        ? t('overdue')
        : state.kind === 'today'
          ? t('dueToday')
          : t('dueIn', { count: state.days })

  return (
    <Badge
      variant={state?.kind === 'overdue' ? 'destructive' : 'outline'}
      className={cn('gap-1', className)}
      title={t('dueOn', { date })}
      data-testid="prompt-due"
    >
      <IconCalendarDue aria-hidden="true" />
      {label}
    </Badge>
  )
}

/**
 * The viewer's own grade on a graded prompt (#873): score and the teacher's
 * feedback. Only ever rendered with the viewer's own row — the server never
 * sends anyone else's.
 */
export function PromptGradeResult({ grade, className }: { grade: ViewerPromptGrade; className?: string }) {
  const t = useTranslations('community.promptGrade')

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3 space-y-1.5', className)} data-testid="prompt-grade">
      <div className="flex items-center gap-2 text-sm">
        <IconMessage2Check className="size-4 text-brand-text" aria-hidden="true" />
        <span className="font-medium">{t('yourGrade')}</span>
        <span className="font-semibold tabular-nums" data-testid="prompt-grade-score">
          {t('score', { score: grade.score })}
        </span>
      </div>
      {grade.feedback && (
        <div className="text-sm">
          <p className="text-xs font-medium text-muted-foreground">{t('feedback')}</p>
          <p className="whitespace-pre-wrap break-words" data-testid="prompt-grade-feedback">
            {grade.feedback}
          </p>
        </div>
      )}
    </div>
  )
}
