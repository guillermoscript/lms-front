'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { IconCheck, IconSparkles, IconX } from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AiErrorNotice } from '@/components/ai/ai-error-notice'
import { cn } from '@/lib/utils'
import { clampInt } from './graded-fields'
import {
  EXAM_DEFAULT_TOLERANCE,
  evalRequest,
  type AiSetupError,
  type ExamCasePatch,
  type ExamCaseRow,
  type ExamPreviewResult,
  type ExamQuestionInfo,
} from './exam-types'

type SaveMeta = { source: 'teacher' | 'preview' }

interface Props {
  examId: number
  questions: ExamQuestionInfo[]
  item: ExamCaseRow | null
  onClose: () => void
  onSave: (patch: ExamCasePatch, meta: SaveMeta) => void
  saving: boolean
  error: string | null
}

function ClosedPicker({
  question,
  value,
  onChange,
  disabled,
}: {
  question: ExamQuestionInfo
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam.editor')
  const choices =
    question.type === 'true_false'
      ? [
          { id: 'true', text: t('true') },
          { id: 'false', text: t('false') },
        ]
      : question.options
  return (
    <div role="radiogroup" aria-label={question.text} className="flex flex-wrap gap-2">
      {choices.map((choice) => {
        const selected = value === choice.id
        return (
          <button
            key={choice.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(selected ? '' : choice.id)}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-left text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50',
              selected ? 'border-brand-text bg-brand-tint font-medium text-brand-text' : 'bg-background text-muted-foreground hover:text-foreground'
            )}
          >
            {selected && <IconCheck aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />}
            <span className="min-w-0 break-words">{choice.text || t('emptyOption')}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Create (item = null) or edit an exam sample submission; can also dry-run the AI grader on it. */
export function ExamCaseDialog({ examId, questions, item, onClose, onSave, saving, error }: Props) {
  const t = useTranslations('dashboard.teacher.aiEvals.graded.exam.editor')
  const [name, setName] = useState(item?.name ?? '')
  const [note, setNote] = useState(item?.importance_note ?? '')
  const [answers, setAnswers] = useState<Record<string, string>>(() => ({ ...(item?.input?.answers ?? {}) }))
  const [points, setPoints] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const q of questions) {
      const e = item?.expected?.questions?.[q.id]
      if (q.type === 'free_text' && e) out[q.id] = String(e.points_earned)
    }
    return out
  })
  const [tolerance, setTolerance] = useState(String(item?.expected?.total_tolerance ?? EXAM_DEFAULT_TOLERANCE))

  const [trying, setTrying] = useState(false)
  const locale = useLocale()
  const [preview, setPreview] = useState<ExamPreviewResult | null>(null)
  const [tryError, setTryError] = useState<string | null>(null)
  const [aiError, setAiError] = useState<AiSetupError | null>(null)

  const written = questions.filter((q) => q.type === 'free_text')
  const answeredWritten = written.some((q) => (answers[q.id] ?? '').trim() !== '')
  const tol = clampInt(tolerance, 0, 50, EXAM_DEFAULT_TOLERANCE)

  const cleanAnswers = () => {
    const out: Record<string, string> = {}
    for (const q of questions) {
      const v = q.type === 'free_text' ? (answers[q.id] ?? '').trim() : (answers[q.id] ?? '')
      if (v !== '') out[q.id] = v
    }
    return out
  }

  const buildPatch = (fromAi: boolean): ExamCasePatch => {
    const expectedQuestions: ExamCasePatch['expected']['questions'] = {}
    for (const q of written) {
      let earned: number
      if (fromAi) {
        earned = preview?.questions.find((p) => String(p.question_id) === q.id)?.points_earned ?? 0
      } else {
        earned = clampInt(points[q.id] ?? '', 0, q.points, 0)
      }
      expectedQuestions[q.id] = { points_earned: Math.min(q.points, Math.max(0, Math.round(earned))), tolerance: tol }
    }
    return {
      name: name.trim(),
      importance_note: note.trim() || null,
      input: { answers: cleanAnswers() },
      expected: { questions: expectedQuestions, total_tolerance: tol },
    }
  }

  const tryGrading = async () => {
    setTrying(true)
    setTryError(null)
    setAiError(null)
    const res = await evalRequest<ExamPreviewResult>(`/api/teacher/evals/exam/${examId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ answers: cleanAnswers(), locale: locale === 'es' ? 'es' : 'en' }),
    })
    setTrying(false)
    if (res.aiError) return setAiError(res.aiError)
    if (!res.ok || !res.data) {
      const known = ['plan_required', 'no_ai_questions', 'unknown_question']
      return setTryError(res.code && known.includes(res.code) ? t(`errors.${res.code}`) : t('errors.previewFailed'))
    }
    setPreview(res.data)
  }

  const busy = saving || trying
  const canSave = !!name.trim() && answeredWritten

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t('editTitle') : t('addTitle')}</DialogTitle>
          <DialogDescription>{item ? t('editDescription') : t('addDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">{t('name')}</Label>
            <Input id="ec-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
          </div>

          <ol className="space-y-4">
            {questions.map((q, index) => (
              <li key={q.id} className="space-y-2 rounded-lg border bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{t('questionLabel', { n: index + 1 })}</span>
                  <Badge variant="outline">{t('pointsLabel', { points: q.points })}</Badge>
                  {q.type === 'free_text' ? (
                    <Badge variant="secondary" className="gap-1">
                      <IconSparkles aria-hidden="true" className="h-3 w-3" />
                      {t('aiGraded')}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">{t('autoScored')}</Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words text-sm">{q.text}</p>
                {q.type === 'free_text' ? (
                  <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                    <div className="space-y-1.5">
                      <Label htmlFor={`ec-a-${q.id}`}>{t('answer')}</Label>
                      <Textarea
                        id={`ec-a-${q.id}`}
                        rows={4}
                        maxLength={5000}
                        value={answers[q.id] ?? ''}
                        disabled={busy}
                        onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`ec-p-${q.id}`}>{t('expectedPoints', { max: q.points })}</Label>
                      <Input
                        id={`ec-p-${q.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={q.points}
                        value={points[q.id] ?? ''}
                        disabled={busy}
                        onChange={(e) => setPoints((p) => ({ ...p, [q.id]: e.target.value }))}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">{t('closedHint')}</p>
                    <ClosedPicker question={q} value={answers[q.id] ?? ''} disabled={busy} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="grid gap-3 sm:grid-cols-[9rem_1fr] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ec-tol">{t('tolerance')}</Label>
              <Input
                id="ec-tol"
                type="number"
                inputMode="numeric"
                min={0}
                max={50}
                value={tolerance}
                disabled={busy}
                onChange={(e) => setTolerance(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">{t('toleranceHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ec-note">{t('note')}</Label>
            <Textarea id="ec-note" rows={2} value={note} maxLength={2000} disabled={busy} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="space-y-3 rounded-lg border border-dashed p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">{t('tryHint')}</p>
              <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={busy || !answeredWritten} onClick={() => void tryGrading()}>
                <IconSparkles aria-hidden="true" className="h-3.5 w-3.5" />
                {trying ? t('trying') : t('tryGrading')}
              </Button>
            </div>
            {aiError && <AiErrorNotice code={aiError.code} canConfigure={aiError.canConfigure} settingsUrl={aiError.settingsUrl} audience="teacher" />}
            {tryError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
                {tryError}
              </p>
            )}
            {preview && (
              <div role="status" className="space-y-2">
                <p className="text-sm font-semibold">{t('tryResult', { score: Math.round(preview.score) })}</p>
                <ul className="space-y-1.5 text-xs">
                  {preview.questions
                    .filter((p) => !p.auto)
                    .map((p) => {
                      const idx = questions.findIndex((q) => q.id === String(p.question_id))
                      return (
                        <li key={p.question_id} className="rounded-md bg-muted/40 px-2.5 py-2">
                          <span className="font-medium tabular-nums">
                            {t('questionLabel', { n: idx + 1 })}: {t('aiPoints', { earned: p.points_earned, possible: p.points_possible })}
                          </span>
                          {p.feedback && <span className="text-muted-foreground"> · {p.feedback}</span>}
                        </li>
                      )
                    })}
                </ul>
                {!item && (
                  <div className="space-y-1">
                    <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => onSave(buildPatch(true), { source: 'preview' })}>
                      {saving ? t('saving') : t('saveWithAi')}
                    </Button>
                    <p className="text-xs text-muted-foreground">{name.trim() ? t('saveWithAiHint') : t('nameFirst')}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
              <IconX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button type="button" onClick={() => onSave(buildPatch(false), { source: 'teacher' })} disabled={busy || !canSave}>
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
