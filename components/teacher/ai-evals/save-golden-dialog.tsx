'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { UIMessage } from 'ai'
import { IconPlus, IconStar } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { findLessonCompletion } from '@/lib/ai/lesson-completion'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import { evalRequest, type AiSetupError, type EvalsProp } from './types'

type Expectation = 'complete' | 'not_complete' | 'either'

interface Props extends EvalsProp {
  open: boolean
  onOpenChange: (open: boolean) => void
  messages: UIMessage[]
}

/** useChat messages -> the plain transcript the API stores. */
function toTranscript(messages: UIMessage[]) {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      text: m.parts
        .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
        .map((p) => p.text)
        .join('\n')
        .trim()
        .slice(0, 4000),
    }))
    .filter((m) => m.text.length > 0)
    .slice(0, 40)
}

/** Student turn (1-based) at which the tutor granted completion, if it did. */
function completedTurn(messages: UIMessage[]): number | null {
  let userTurns = 0
  for (const message of messages) {
    if (message.role === 'user') userTurns += 1
    else if (message.role === 'assistant' && findLessonCompletion([message])) return Math.max(1, userTurns)
  }
  return null
}

export function SaveGoldenDialog(props: Props) {
  // Mounted only while open (see the preview modal), so state starts fresh.
  return <SaveGoldenForm {...props} />
}

function SaveGoldenForm({ open, onOpenChange, lessonId, draft, messages }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals.saveGolden')
  const transcript = useMemo(() => toTranscript(messages), [messages])
  const turn = useMemo(() => completedTurn(messages), [messages])
  const completed = turn !== null

  const firstUser = transcript.find((m) => m.role === 'user')?.text ?? ''
  const [name, setName] = useState(firstUser.length > 60 ? `${firstUser.slice(0, 57)}...` : firstUser)
  const [note, setNote] = useState('')
  const [expectation, setExpectation] = useState<Expectation>(completed ? 'complete' : 'not_complete')
  const [criteria, setCriteria] = useState<{ text: string; checked: boolean }[]>(() =>
    (['reveal', 'questions', 'onTask', 'language'] as const).map((key) => ({ text: t(`defaults.${key}`), checked: key !== 'language' }))
  )
  const [custom, setCustom] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)

  const addCriterion = () => {
    const text = custom.trim()
    if (!text) return
    setCriteria((prev) => (prev.some((c) => c.text === text) ? prev : [...prev, { text, checked: true }]))
    setCustom('')
  }

  const selected = criteria.filter((c) => c.checked).map((c) => c.text)
  const tooMany = selected.length > 8

  const save = async () => {
    setSaving(true)
    setError(null)
    setAiError(null)
    const res = await evalRequest(`/api/teacher/evals/lesson-task/${lessonId}/cases`, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'golden_chat',
        source: 'preview',
        name: name.trim(),
        importance_note: note.trim() || null,
        expected: { completed: expectation === 'either' ? null : expectation === 'complete' },
        must_keep: selected,
        input: { messages: transcript },
        golden_output: { completed, completed_turn: turn },
        draft,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success(t('saved'))
      onOpenChange(false)
      return
    }
    if (res.aiError) setAiError(res.aiError)
    else setError(res.code === 'case_limit' ? t('errors.caseLimit') : t('errors.generic'))
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
            <Label htmlFor="golden-name">{t('nameLabel')}</Label>
            <Input id="golden-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="golden-note">{t('noteLabel')}</Label>
            <Textarea id="golden-note" rows={3} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('noteHint')}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('expectedLabel')}</legend>
            <p className="text-xs text-muted-foreground">
              {completed ? t('whatHappenedCompleted', { turn: turn ?? 0 }) : t('whatHappenedNotCompleted')}
            </p>
            <RadioGroup value={expectation} onValueChange={(v) => setExpectation(v as Expectation)} className="gap-2">
              {(['complete', 'not_complete', 'either'] as const).map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 has-data-checked:border-primary has-data-checked:bg-brand-tint">
                  <RadioGroupItem value={option} />
                  <span>{t(`expected.${option}`)}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('mustKeepLabel')}</legend>
            <p className="text-xs text-muted-foreground">{t('mustKeepHint')}</p>
            <ul className="space-y-1.5">
              {criteria.map((criterion, index) => (
                <li key={criterion.text}>
                  <label className="flex cursor-pointer items-center gap-2.5 py-0.5">
                    <Checkbox
                      checked={criterion.checked}
                      onCheckedChange={(checked) =>
                        setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, checked: checked === true } : c)))
                      }
                    />
                    <span>{criterion.text}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Input
                value={custom}
                maxLength={300}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addCriterion()
                  }
                }}
                placeholder={t('addCriterionPlaceholder')}
                aria-label={t('addCriterionPlaceholder')}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addCriterion} disabled={!custom.trim()}>
                <IconPlus aria-hidden="true" className="h-3.5 w-3.5" />
                {t('addCriterion')}
              </Button>
            </div>
            {tooMany && <p className="text-xs text-destructive">{t('errors.tooManyCriteria')}</p>}
          </fieldset>

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
          <Button type="button" onClick={save} disabled={saving || !name.trim() || tooMany || transcript.length === 0}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
