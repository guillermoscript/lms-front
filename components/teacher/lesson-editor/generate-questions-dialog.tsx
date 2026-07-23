'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  IconSparkles,
  IconLoader2,
  IconTrash,
  IconVideo,
  IconCircleCheck,
} from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveApprovedQuestions, type SavedQuestionResult } from '@/app/actions/teacher/generated-questions'
import type {
  ApprovedQuestion,
  GeneratedQuestion,
  GenerateQuestionsResponse,
} from '@/lib/lessons/generated-questions'
import { useLessonEditor } from './lesson-editor-context'

type Phase = 'idle' | 'generating' | 'review' | 'saving' | 'saved'

interface Draft extends GeneratedQuestion {
  include: boolean
  addToVideo: boolean
}

function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function parseTimestamp(value: string): number {
  const parts = value.split(':').map((p) => Number(p.trim()))
  if (parts.some((n) => Number.isNaN(n) || n < 0)) return -1
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 1) return parts[0]
  return -1
}

export function GenerateQuestionsDialog() {
  const { formData, courseId, initialData } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor.generateQuestions')

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [transcriptUsed, setTranscriptUsed] = useState(false)
  const [saved, setSaved] = useState<SavedQuestionResult[]>([])

  // Generation needs a saved lesson (drafts attach to lesson_id).
  const lessonId = initialData?.id
  if (!lessonId) return null

  const hasVideo = Boolean(formData.video_url?.trim())
  const includedCount = drafts.filter((d) => d.include).length

  const generate = async () => {
    setPhase('generating')
    setError(null)
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}/generate-questions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: formData.content || '' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error || t('generateFailed'))
      }
      const data = (await res.json()) as GenerateQuestionsResponse
      setDrafts(
        data.questions.map((q) => ({
          ...q,
          include: true,
          addToVideo: hasVideo && q.video_timestamp_seconds >= 0,
        }))
      )
      setTranscriptUsed(data.transcript_used)
      setPhase('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('generateFailed'))
      setPhase('idle')
    }
  }

  const updateDraft = (index: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  const removeDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  const save = async () => {
    setPhase('saving')
    setError(null)
    const items: ApprovedQuestion[] = drafts
      .filter((d) => d.include)
      .map(({ include: _include, addToVideo, ...q }) => ({
        ...q,
        create_video_checkpoint: addToVideo && q.video_timestamp_seconds >= 0,
      }))
    try {
      const result = await saveApprovedQuestions(courseId, lessonId, items)
      if (!result.success) throw new Error(result.error)
      setSaved(result.data.saved)
      setPhase('saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
      setPhase('review')
    }
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setPhase('idle')
      setError(null)
      setDrafts([])
      setSaved([])
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="generate-questions-button"
        onClick={() => {
          setOpen(true)
          void generate()
        }}
      >
        <IconSparkles className="h-3.5 w-3.5" />
        {t('button')}
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconSparkles className="h-4 w-4 text-primary" />
              {t('title')}
            </DialogTitle>
            <DialogDescription>
              {phase === 'review' && transcriptUsed
                ? t('descriptionWithTranscript')
                : t('description')}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {phase === 'generating' && (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <IconLoader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">{t('generating')}</p>
            </div>
          )}

          {phase === 'idle' && !error && (
            <div className="py-16 text-center text-sm text-muted-foreground">{t('generating')}</div>
          )}

          {phase === 'idle' && error && (
            <div className="flex justify-center py-8">
              <Button type="button" onClick={() => void generate()}>
                {t('retry')}
              </Button>
            </div>
          )}

          {(phase === 'review' || phase === 'saving') && (
            <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-1">
              {drafts.map((draft, index) => (
                <div
                  key={index}
                  className={
                    'rounded-lg border p-4 transition-opacity ' +
                    (draft.include ? '' : 'opacity-50')
                  }
                  data-testid="generated-question-card"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={draft.include}
                        onCheckedChange={(checked) =>
                          updateDraft(index, { include: checked === true })
                        }
                        aria-label={t('includeQuestion')}
                      />
                      <Badge variant="secondary">{t(`kind_${draft.kind}`)}</Badge>
                      <Badge variant="outline">{t(`difficulty_${draft.difficulty}`)}</Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeDraft(index)}
                      aria-label={t('discard')}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <Input
                      value={draft.title}
                      onChange={(e) => updateDraft(index, { title: e.target.value })}
                      aria-label={t('fieldTitle')}
                    />
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">
                        {t('fieldPrompt')}
                      </Label>
                      <Textarea
                        value={draft.prompt}
                        rows={2}
                        onChange={(e) => updateDraft(index, { prompt: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 text-xs text-muted-foreground">
                        {t('fieldRubric')}
                      </Label>
                      <Textarea
                        value={draft.rubric}
                        rows={2}
                        onChange={(e) => updateDraft(index, { rubric: e.target.value })}
                      />
                    </div>

                    {draft.kind === 'short_answer' && (
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">
                          {t('fieldKeywords')}
                        </Label>
                        <Input
                          value={draft.expected_keywords.join(', ')}
                          onChange={(e) =>
                            updateDraft(index, {
                              expected_keywords: e.target.value
                                .split(',')
                                .map((k) => k.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                    )}

                    {draft.kind === 'fill_in_the_blank' && (
                      <div>
                        <Label className="mb-1 text-xs text-muted-foreground">
                          {t('fieldAcceptedAnswers')}
                        </Label>
                        <Input
                          value={draft.accepted_answers.join(', ')}
                          onChange={(e) =>
                            updateDraft(index, {
                              accepted_answers: e.target.value
                                .split(',')
                                .map((a) => a.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </div>
                    )}

                    {draft.kind === 'multiple_choice' && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                          {t('fieldOptions')}
                        </Label>
                        {draft.options.map((option, optionIndex) => (
                          <label
                            key={optionIndex}
                            className="flex cursor-pointer items-center gap-2 text-sm"
                          >
                            <input
                              type="radio"
                              name={`correct-${index}`}
                              checked={draft.correct_index === optionIndex}
                              onChange={() => updateDraft(index, { correct_index: optionIndex })}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                        <p className="text-[11px] text-muted-foreground/60">{t('optionsHint')}</p>
                      </div>
                    )}

                    {hasVideo && (
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={draft.addToVideo && draft.video_timestamp_seconds >= 0}
                          onCheckedChange={(checked) =>
                            updateDraft(index, { addToVideo: checked === true })
                          }
                          disabled={draft.video_timestamp_seconds < 0}
                          aria-label={t('addToVideo')}
                        />
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <IconVideo className="h-4 w-4" />
                          {t('addToVideoAt')}
                        </span>
                        <Input
                          className="w-20"
                          placeholder="m:ss"
                          value={
                            draft.video_timestamp_seconds >= 0
                              ? formatTimestamp(draft.video_timestamp_seconds)
                              : ''
                          }
                          onChange={(e) => {
                            const seconds = parseTimestamp(e.target.value)
                            updateDraft(
                              index,
                              seconds >= 0
                                ? { video_timestamp_seconds: seconds, addToVideo: true }
                                : { video_timestamp_seconds: -1, addToVideo: false }
                            )
                          }}
                          aria-label={t('fieldTimestamp')}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {phase === 'saved' && (
            <div className="space-y-2 py-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <IconCircleCheck className="h-5 w-5 text-green-600" />
                {t('savedSummary', { count: saved.length })}
              </p>
              <ul className="ml-7 list-disc space-y-1 text-sm text-muted-foreground">
                {saved.map((item) => (
                  <li key={item.exerciseId}>
                    {item.title}
                    {item.checkpointCreated && (
                      <Badge variant="secondary" className="ml-2">
                        {t('checkpointBadge')}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                {t('savedHint')}{' '}
                <Link
                  className="underline underline-offset-2"
                  href={`/dashboard/teacher/courses/${courseId}/exercises`}
                >
                  {t('savedLink')}
                </Link>
              </p>
            </div>
          )}

          <DialogFooter>
            {(phase === 'review' || phase === 'saving') && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={phase === 'saving'}
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="button"
                  data-testid="save-approved-questions"
                  onClick={() => void save()}
                  disabled={phase === 'saving' || includedCount === 0}
                >
                  {phase === 'saving' ? (
                    <IconLoader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    t('saveApproved', { count: includedCount })
                  )}
                </Button>
              </>
            )}
            {phase === 'saved' && (
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t('done')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
