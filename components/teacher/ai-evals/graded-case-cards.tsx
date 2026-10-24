'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconPencil } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DeleteButton } from './case-cards'
import { ExpectedFields, fromExpectedState, toExpectedState, type ExpectedFormState } from './graded-fields'
import { DEFAULT_GRADED_TOLERANCE, type GradedCaseRow, type GradedCategory } from './types'

/** "score ±tolerance" plus the pass/fail override when the teacher set one. */
export function ExpectedSummary({ expected }: { expected: GradedCaseRow['expected'] }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.cases')
  return (
    <span className="tabular-nums">
      {t('expectedRange', { score: expected.score, tolerance: expected.tolerance })}
      {expected.passed !== null && expected.passed !== undefined && (
        <span className="text-muted-foreground"> · {t(expected.passed ? 'mustPass' : 'mustFail')}</span>
      )}
    </span>
  )
}

export function CategoryBadge({ category }: { category: GradedCategory | undefined }) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.categories')
  if (!category) return null
  const risky = category === 'injection' || category === 'keyword_stuffing'
  return <Badge variant={risky ? 'outline' : 'secondary'}>{t(category)}</Badge>
}

export function GradedCaseCard({
  item,
  busy,
  onEdit,
  onDelete,
}: {
  item: GradedCaseRow
  busy: boolean
  onEdit: (item: GradedCaseRow) => void
  onDelete: (item: GradedCaseRow) => void
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.cases')
  const unverified = item.source === 'generated' && !item.teacher_edited
  const sourceKey = item.source === 'preview' || item.source === 'teacher' || item.source === 'submission' ? item.source : 'generated'
  return (
    <li className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-sm font-medium">{item.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <CategoryBadge category={item.expected?.category} />
            <Badge variant="outline">{t(`source.${sourceKey}`)}</Badge>
            {unverified && (
              <Badge variant="outline" className="border-warning/40 text-warning">
                {t('unverified')}
              </Badge>
            )}
            {item.teacher_edited && <Badge variant="secondary">{t('editedByYou')}</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t('editAria', { name: item.name })}
            disabled={busy}
            onClick={() => onEdit(item)}
          >
            <IconPencil aria-hidden="true" className="h-4 w-4" />
          </Button>
          <DeleteButton name={item.name} disabled={busy} onConfirm={() => onDelete(item)} />
        </div>
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
        {item.input?.content}
      </p>
      {item.importance_note && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t('whyItMatters')}: </span>
          {item.importance_note}
        </p>
      )}
      <p className="mt-2 text-xs">
        <span className="text-muted-foreground">{t('expectedLabel')}: </span>
        <ExpectedSummary expected={item.expected} />
      </p>
    </li>
  )
}

export interface GradedCasePatch {
  name: string
  importance_note: string | null
  input: { content: string }
  expected: { score: number; tolerance: number; passed: boolean | null }
}

/** Create (item = null) or edit a graded case. */
export function GradedCaseDialog({
  item,
  onClose,
  onSave,
  saving,
  error,
}: {
  item: GradedCaseRow | null
  onClose: () => void
  onSave: (patch: GradedCasePatch) => void
  saving: boolean
  error: string | null
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.dialog')
  const [name, setName] = useState(item?.name ?? '')
  const [content, setContent] = useState(item?.input?.content ?? '')
  const [note, setNote] = useState(item?.importance_note ?? '')
  const [expected, setExpected] = useState<ExpectedFormState>(
    item ? toExpectedState(item.expected) : { score: '70', tolerance: String(DEFAULT_GRADED_TOLERANCE), passed: 'auto' }
  )

  const submit = () =>
    onSave({
      name: name.trim(),
      importance_note: note.trim() || null,
      input: { content: content.trim() },
      expected: fromExpectedState(expected, DEFAULT_GRADED_TOLERANCE),
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>{item ? t('editDescription') : t('addDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="gc-name">{t('name')}</Label>
            <Input id="gc-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gc-content">{t('answer')}</Label>
            <Textarea id="gc-content" rows={7} value={content} maxLength={20000} onChange={(e) => setContent(e.target.value)} />
          </div>
          <ExpectedFields idPrefix="gc" state={expected} onChange={setExpected} disabled={saving} />
          <div className="space-y-1.5">
            <Label htmlFor="gc-note">{t('note')}</Label>
            <Textarea id="gc-note" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={submit} disabled={saving || !name.trim() || !content.trim()}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
