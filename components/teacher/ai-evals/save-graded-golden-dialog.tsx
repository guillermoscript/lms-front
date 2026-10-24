'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconStar } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import { ExpectedFields, fromExpectedState, type ExpectedFormState } from './graded-fields'
import { DEFAULT_GRADED_TOLERANCE, GRADED_CASES_CHANGED_EVENT, evalRequest, type AiSetupError } from './types'

export interface GradedPreviewRun {
  content: string
  metadata?: Record<string, unknown>
  score: number
  passed: boolean
  feedback?: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  exerciseId: number
  run: GradedPreviewRun
}

export function SaveGradedGoldenDialog(props: Props) {
  // Mounted while open only, so the form state starts fresh each time.
  return props.open ? <SaveGradedGoldenForm {...props} /> : null
}

function SaveGradedGoldenForm({ open, onOpenChange, exerciseId, run }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.saveGolden')
  const firstLine = run.content.trim().split('\n')[0] ?? ''
  const [name, setName] = useState(firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine)
  const [note, setNote] = useState('')
  const [expected, setExpected] = useState<ExpectedFormState>({
    score: String(Math.round(run.score)),
    tolerance: String(DEFAULT_GRADED_TOLERANCE),
    passed: 'auto',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)

  const save = async () => {
    setSaving(true)
    setError(null)
    setAiError(null)
    const res = await evalRequest(`/api/teacher/evals/exercise/${exerciseId}/cases`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'graded_answer',
        source: 'preview',
        name: name.trim(),
        importance_note: note.trim() || null,
        input: { content: run.content, ...(run.metadata ? { metadata: run.metadata } : {}) },
        expected: fromExpectedState(expected, DEFAULT_GRADED_TOLERANCE),
        golden_output: { score: Math.round(run.score), passed: run.passed, feedback: run.feedback ?? '' },
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success(t('saved'))
      window.dispatchEvent(new Event(GRADED_CASES_CHANGED_EVENT))
      onOpenChange(false)
      return
    }
    if (res.aiError) setAiError(res.aiError)
    else if (res.code === 'case_limit') setError(t('errors.caseLimit'))
    else if (res.code === 'unsupported_type') setError(t('errors.unsupported'))
    else setError(t('errors.generic'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <IconStar aria-hidden="true" className="h-4 w-4 text-brand-text" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="gg-name">{t('nameLabel')}</Label>
            <Input id="gg-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gg-answer">{t('answerLabel')}</Label>
            <Textarea id="gg-answer" rows={4} value={run.content} readOnly className="max-h-40 bg-muted/30 text-xs" />
            <p className="text-xs text-muted-foreground">{t('gradeNote', { score: Math.round(run.score) })}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gg-note">{t('noteLabel')}</Label>
            <Textarea id="gg-note" rows={2} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('noteHint')}</p>
          </div>

          <ExpectedFields idPrefix="gg" state={expected} onChange={setExpected} disabled={saving} />

          {aiError && <AiErrorNotice code={aiError.code} canConfigure={aiError.canConfigure} settingsUrl={aiError.settingsUrl} audience="teacher" />}
          {error && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving || !name.trim()}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
