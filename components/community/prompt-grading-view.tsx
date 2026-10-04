'use client'

// Staff register: a list of students, one hairline row each, the grade form
// inline under the answers. Progressive disclosure is the filter, not a sheet:
// "To grade" is the default working set.

import { useId, useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { removePromptGrade, savePromptGrade } from '@/app/actions/teacher/community-grades'
import {
  GRADE_FEEDBACK_MAX,
  GRADING_FILTERS,
  filterRoster,
  gradingStatus,
  parseGradeScore,
  rosterCounts,
  sortRoster,
  type GradingFilter,
  type GradingRow,
} from '@/lib/community/prompt-grades'
import { CommunityMarkdown } from './community-markdown'

interface PromptGradingViewProps {
  courseId: number
  postId: string
  rows: GradingRow[]
  initialFilter: GradingFilter
}

export function PromptGradingView({ courseId, postId, rows: initialRows, initialFilter }: PromptGradingViewProps) {
  const t = useTranslations('community.grading')
  const [rows, setRows] = useState(initialRows)
  // Nothing to grade yet: open on everyone rather than an empty list.
  const [filter, setFilter] = useState<GradingFilter>(() =>
    initialFilter === 'ungraded' && filterRoster(initialRows, 'ungraded').length === 0 ? 'all' : initialFilter
  )
  const counts = rosterCounts(rows)
  // The order is fixed on load, so a row does not jump away as it is graded.
  const order = useMemo(() => sortRoster(initialRows).map((r) => r.studentId), [initialRows])
  const byId = new Map(rows.map((r) => [r.studentId, r]))
  const ordered = order.map((id) => byId.get(id)).filter((r): r is GradingRow => Boolean(r))
  // A row graded (or ungraded) under this filter stays put until the filter
  // changes, so the teacher sees what they saved instead of the row vanishing.
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const matching = new Set(filterRoster(ordered, filter).map((r) => r.studentId))
  const visible = ordered.filter((r) => matching.has(r.studentId) || touched.has(r.studentId))

  function changeFilter(next: GradingFilter) {
    setFilter(next)
    setTouched(new Set())
  }

  function onSaved(studentId: string, grade: GradingRow['grade']) {
    setRows((current) => current.map((r) => (r.studentId === studentId ? { ...r, grade } : r)))
    setTouched((current) => new Set(current).add(studentId))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('filterLabel')}>
        {GRADING_FILTERS.map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? 'default' : 'outline'}
            aria-pressed={filter === f}
            onClick={() => changeFilter(f)}
            data-testid={`grading-filter-${f}`}
          >
            {t('filterCount', { label: t(`filters.${f}`), count: counts[f] })}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyRoster')}</p>
      ) : visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('emptyFilter')}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((row) => (
            <GradingRowItem key={row.studentId} row={row} courseId={courseId} postId={postId} onSaved={onSaved} />
          ))}
        </ul>
      )}
    </div>
  )
}

function GradingRowItem({
  row,
  courseId,
  postId,
  onSaved,
}: {
  row: GradingRow
  courseId: number
  postId: string
  onSaved: (studentId: string, grade: GradingRow['grade']) => void
}) {
  const t = useTranslations('community.grading')
  const format = useFormatter()
  const fieldId = useId()
  const [score, setScore] = useState(row.grade ? String(row.grade.score) : '')
  const [feedback, setFeedback] = useState(row.grade?.feedback ?? '')
  const [pending, setPending] = useState<'save' | 'remove' | null>(null)
  const [scoreError, setScoreError] = useState(false)

  const status = gradingStatus(row)
  const name = row.name ?? t('unknownStudent')
  const unchanged = row.grade !== null && String(row.grade.score) === score && (row.grade.feedback ?? '') === feedback.trim()

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    const parsed = parseGradeScore(score)
    if (parsed === null) {
      setScoreError(true)
      return
    }
    setScoreError(false)
    setPending('save')
    try {
      const result = await savePromptGrade({ courseId, postId, studentId: row.studentId, score: parsed, feedback })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      if (!result.data) return
      const saved = result.data
      setFeedback(saved.feedback ?? '')
      onSaved(row.studentId, { score: saved.score, feedback: saved.feedback, graded_at: saved.graded_at })
      toast.success(t('saved'))
    } finally {
      setPending(null)
    }
  }

  async function handleRemove() {
    setPending('remove')
    try {
      const result = await removePromptGrade({ courseId, postId, studentId: row.studentId })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      setScore('')
      setFeedback('')
      onSaved(row.studentId, null)
      toast.success(t('removed'))
    } finally {
      setPending(null)
    }
  }

  return (
    <li className="space-y-3 p-4" data-testid="grading-row" data-student-id={row.studentId} data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground">{t('answers', { count: row.answers.length })}</p>
        </div>
        <div className="flex items-center gap-2">
          {row.grade && (
            <span className="text-sm font-semibold tabular-nums" data-testid="grading-row-score">
              {t('gradedScore', { score: row.grade.score })}
            </span>
          )}
          <Badge
            variant={status === 'graded' ? 'secondary' : status === 'ungraded' ? 'default' : 'outline'}
            data-testid="grading-row-status"
          >
            {t(`status.${status}`)}
          </Badge>
        </div>
      </div>

      {row.answers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noAnswer')}</p>
      ) : (
        <div className="space-y-2">
          {row.answers.map((answer) => (
            <div key={answer.id} className="rounded-lg bg-muted/40 p-3">
              <p className="mb-1 text-[11px] text-muted-foreground">
                {format.dateTime(new Date(answer.created_at), { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
              <CommunityMarkdown content={answer.content} className="text-sm" collapsible />
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSave} className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-score`} className="text-xs">
            {t('score')}
          </Label>
          <Input
            id={`${fieldId}-score`}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            step={1}
            value={score}
            onChange={(e) => {
              setScore(e.target.value)
              setScoreError(false)
            }}
            aria-invalid={scoreError || undefined}
            aria-describedby={scoreError ? `${fieldId}-score-error` : undefined}
            required
            data-testid="grading-score"
          />
          {scoreError && (
            <p id={`${fieldId}-score-error`} className="text-[11px] text-destructive">
              {t('invalidScore')}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${fieldId}-feedback`} className="text-xs">
            {t('feedback')}
          </Label>
          <Textarea
            id={`${fieldId}-feedback`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t('feedbackPlaceholder')}
            maxLength={GRADE_FEEDBACK_MAX}
            className="min-h-[72px] resize-y"
            data-testid="grading-feedback"
          />
        </div>
        <div className={cn('flex flex-wrap items-center justify-end gap-2 sm:col-span-2')}>
          {row.grade && (
            <span className="mr-auto text-[11px] text-muted-foreground">
              {t('gradedOn', { date: format.dateTime(new Date(row.grade.graded_at), { dateStyle: 'medium' }) })}
            </span>
          )}
          {row.grade && (
            <Button type="button" variant="ghost" size="sm" onClick={handleRemove} disabled={pending !== null}>
              {t('remove')}
            </Button>
          )}
          <Button type="submit" size="sm" disabled={pending !== null || unchanged} data-testid="grading-save">
            {pending === 'save' ? t('saving') : row.grade ? t('update') : t('save')}
          </Button>
        </div>
      </form>
    </li>
  )
}
