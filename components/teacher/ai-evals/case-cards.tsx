'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { IconMessages, IconPencil, IconTrash, IconUserQuestion } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { EvalCaseRow, GoldenInput, ScenarioInput } from '@/lib/ai/evals/schema'

export type ExpectedKey = 'complete' | 'not_complete' | 'either'

export function expectedKey(completed: boolean | null | undefined): ExpectedKey {
  return completed === true ? 'complete' : completed === false ? 'not_complete' : 'either'
}

export function expectedValue(key: ExpectedKey): boolean | null {
  return key === 'complete' ? true : key === 'not_complete' ? false : null
}

export function ExpectedBadge({ value }: { value: ExpectedKey }) {
  const t = useTranslations('dashboard.teacher.aiEvals.expected')
  return <Badge variant="outline">{t(value)}</Badge>
}

/** Three-way segmented control for "what must always happen". */
export function ExpectedToggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: ExpectedKey
  onChange: (next: ExpectedKey) => void
  disabled?: boolean
  label: string
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.expected')
  return (
    <div role="group" aria-label={label} className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {(['complete', 'not_complete', 'either'] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          aria-pressed={value === option}
          onClick={() => value !== option && onChange(option)}
          className={cn(
            'rounded-md px-2.5 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
            value === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {t(option)}
        </button>
      ))}
    </div>
  )
}

export function DeleteButton({ name, onConfirm, disabled }: { name: string; onConfirm: () => void; disabled?: boolean }) {
  const t = useTranslations('dashboard.teacher.aiEvals.cases')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        aria-label={t('deleteAria', { name })}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <IconTrash aria-hidden="true" className="h-4 w-4" />
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription', { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface CardProps {
  item: EvalCaseRow
  busy: boolean
  onExpected: (item: EvalCaseRow, next: ExpectedKey) => void
  onDelete: (item: EvalCaseRow) => void
}

export function GoldenCard({ item, busy, onExpected, onDelete }: CardProps) {
  const t = useTranslations('dashboard.teacher.aiEvals.cases')
  const input = item.input as GoldenInput
  return (
    <li className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <IconMessages aria-hidden="true" className="h-3.5 w-3.5" />
            <span>{t('messageCount', { count: input.messages?.length ?? 0 })}</span>
            <Badge variant="secondary">{t(`source.${item.source === 'real_chat' || item.source === 'teacher' ? item.source : 'preview'}`)}</Badge>
          </div>
        </div>
        <DeleteButton name={item.name} disabled={busy} onConfirm={() => onDelete(item)} />
      </div>
      {item.importance_note && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{t('whyItMatters')}: </span>
          {item.importance_note}
        </p>
      )}
      {item.must_keep.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{t('mustKeep')}: </span>
          {item.must_keep.join(' · ')}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('expectedLabel')}</span>
        <ExpectedToggle
          value={expectedKey(item.expected?.completed)}
          disabled={busy}
          label={t('expectedLabel')}
          onChange={(next) => onExpected(item, next)}
        />
      </div>
    </li>
  )
}

export function ScenarioCard({
  item,
  busy,
  onExpected,
  onDelete,
  onEdit,
}: CardProps & { onEdit: (item: EvalCaseRow) => void }) {
  const t = useTranslations('dashboard.teacher.aiEvals.cases')
  const input = item.input as ScenarioInput
  return (
    <li className="rounded-lg border bg-card p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <IconUserQuestion aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm font-medium">{item.name}</p>
            {item.teacher_edited && <Badge variant="secondary">{t('editedByYou')}</Badge>}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{input.persona}</p>
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t('expectedLabel')}</span>
        <ExpectedToggle
          value={expectedKey(item.expected?.completed)}
          disabled={busy}
          label={t('expectedLabel')}
          onChange={(next) => onExpected(item, next)}
        />
      </div>
    </li>
  )
}

export interface ScenarioPatch {
  name: string
  expected: { completed: boolean | null }
  must_keep: string[]
  scenario: ScenarioInput
}

export function EditScenarioDialog({
  item,
  onClose,
  onSave,
  saving,
  error,
}: {
  item: EvalCaseRow
  onClose: () => void
  onSave: (patch: ScenarioPatch) => void
  saving: boolean
  error: string | null
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.cases.edit')
  const input = item.input as ScenarioInput
  const [name, setName] = useState(item.name)
  const [persona, setPersona] = useState(input.persona)
  const [goal, setGoal] = useState(input.goal ?? '')
  const [expected, setExpected] = useState<ExpectedKey>(expectedKey(item.expected?.completed))
  const [mustKeep, setMustKeep] = useState(item.must_keep.join('\n'))

  const submit = () =>
    onSave({
      name: name.trim(),
      expected: { completed: expectedValue(expected) },
      must_keep: mustKeep.split('\n').map((l) => l.trim()).filter(Boolean),
      scenario: { persona: persona.trim(), goal: goal.trim(), script: input.script ?? [], max_turns: input.max_turns ?? 8 },
    })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="scn-name">{t('name')}</Label>
            <Input id="scn-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scn-persona">{t('persona')}</Label>
            <Textarea id="scn-persona" rows={3} value={persona} maxLength={1000} onChange={(e) => setPersona(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scn-goal">{t('goal')}</Label>
            <Textarea id="scn-goal" rows={2} value={goal} maxLength={1000} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('expected')}</Label>
            <div>
              <ExpectedToggle value={expected} onChange={setExpected} label={t('expected')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="scn-keep">{t('mustKeep')}</Label>
            <Textarea id="scn-keep" rows={3} value={mustKeep} onChange={(e) => setMustKeep(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('mustKeepHint')}</p>
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
          <Button type="button" onClick={submit} disabled={saving || !name.trim() || !persona.trim()}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
