'use client'

import { useMemo, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { IconPlayerPlay, IconRefresh } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Field, FieldLabel, FieldGroup, FieldDescription } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useExerciseBuilder } from './exercise-builder/exercise-builder-context'
import { PreviewDraftSchema, buildPreviewDraft, type PreviewDraft } from '@/lib/exercises/preview'
import { buildConversationInstructions, parseConversationConfig, type ConversationNote, type ConversationTurn } from '@/lib/speech/conversation'
import { parseCheckpointQuestions, CLOSED_EXERCISE_TYPES } from '@/lib/checkpoints/types'
import type { SpeechEvaluation } from '@/lib/speech/types'
import ExerciseBrief from '@/components/exercises/exercise-brief'
import ExerciseResultSummary from '@/components/exercises/exercise-result-summary'

// Recorder, realtime and sandbox bundles load only when the teacher opens a test.
const ConversationExercise = dynamic(() => import('@/components/exercises/conversation-exercise'), { ssr: false })
const ArtifactExercise = dynamic(() => import('@/components/exercises/artifact-exercise'), { ssr: false })
const MediaRecorder = dynamic(() => import('@/components/exercises/media-recorder').then((module) => module.MediaRecorderComponent), { ssr: false })
const VideoRecorder = dynamic(() => import('@/components/exercises/video-recorder').then((module) => module.VideoRecorderComponent), { ssr: false })
const CodePreview = dynamic(() => import('./exercise-preview-code'), { ssr: false })
const SpeechFeedback = dynamic(() => import('@/components/exercises/speech-feedback').then((module) => module.SpeechFeedback), { ssr: false })

interface PreviewResult {
  score: number
  passed: boolean
  feedback?: string
  strengths?: string[]
  improvements?: string[]
  passingScore: number
  perQuestion?: { questionId: string; correct: boolean; correctValue: string | number | boolean | null; explanation?: string }[]
  evaluator?: string
  annotated_transcript?: SpeechEvaluation['annotated_transcript']
  metrics?: SpeechEvaluation['metrics']
  focus_next?: string
}
interface Snapshot { draft: PreviewDraft; files: Record<string, string>; activeFile?: string | null; visibleFiles?: string[] | null }

export function ExercisePreviewModal() {
  const { formData, courseId, initialData, loading } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exercisePreview')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState(false)
  const openPreview = () => {
    const parsed = PreviewDraftSchema.safeParse(buildPreviewDraft(courseId, { ...formData, publish: false }, initialData?.exercise_config ?? {}))
    if (!parsed.success) { setError(true); return }
    setError(false)
    setSnapshot({ draft: parsed.data, files: initialData?.preview_files ?? {}, activeFile: initialData?.active_file, visibleFiles: initialData?.visible_files })
    setRevision((value) => value + 1)
  }
  return <>
    <Button type="button" variant="outline" size="sm" disabled={loading || !formData.title.trim()} onClick={openPreview}>
      <IconPlayerPlay aria-hidden="true" />{t('button')}
    </Button>
    {error && <span role="alert" className="text-sm text-destructive">{t('invalidDraft')}</span>}
    <Dialog open={Boolean(snapshot)} onOpenChange={(open) => { if (!open) setSnapshot(null) }}>
      <DialogContent className="flex h-[90dvh] max-h-[950px] w-[96vw] max-w-6xl sm:max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b p-4 pr-12 sm:p-6 sm:pr-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle>{t('title')}</DialogTitle>
            <Button type="button" variant="outline" size="sm" onClick={openPreview}><IconRefresh aria-hidden="true" />{t('restart')}</Button>
          </div>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {snapshot && <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <ExercisePreviewSession key={revision} snapshot={snapshot} />
        </div>}
      </DialogContent>
    </Dialog>
  </>
}

function ExercisePreviewSession({ snapshot }: { snapshot: Snapshot }) {
  const { draft } = snapshot
  const t = useTranslations('dashboard.teacher.exercisePreview')
  const [content, setContent] = useState('')
  const [answers, setAnswers] = useState<Record<string, string | number | boolean>>({})
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const config = draft.exercise_config
  const passingScore = typeof config.passing_score === 'number' ? config.passing_score : 70
  const questions = useMemo(() => (CLOSED_EXERCISE_TYPES as readonly string[]).includes(draft.exercise_type) ? parseCheckpointQuestions(config) : null, [draft.exercise_type, config])
  const requestEvaluation = useCallback((input: Record<string, unknown>) => fetch('/api/teacher/preview/exercise-run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft, ...input }),
  }), [draft])
  const evaluate = async (input: Record<string, unknown> | FormData) => {
    if (busy) return
    setBusy(true); setError(null); setResult(null)
    try {
      const response = input instanceof FormData ? await fetch('/api/teacher/preview/exercise-run', { method: 'POST', body: input }) : await requestEvaluation(input)
      if (!response.ok) throw new Error(response.status === 429 ? t('limitError') : response.status === 413 ? t('mediaLimit') : t('evaluationError'))
      setResult(await response.json())
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('evaluationError')) }
    finally { setBusy(false) }
  }
  const evaluateMedia = (blob: Blob) => {
    const body = new FormData()
    body.set('draft', JSON.stringify(draft)); body.set('media', blob, 'preview.webm')
    void evaluate(body)
  }
  const conversationConfig = useMemo(() => parseConversationConfig(config), [config])
  const voicePreview = useMemo(() => ({
    tokenEndpoint: `/api/teacher/preview/realtime?courseId=${draft.courseId}`,
    sessionConfig: {
      instructions: buildConversationInstructions(draft, conversationConfig),
      voice: conversationConfig.voice,
      inputAudioTranscription: { language: conversationConfig.target_language },
      turnDetection: { type: 'semantic-vad' as const },
    },
    evaluate: (transcript: ConversationTurn[], notes: ConversationNote[]) => requestEvaluation({ transcript, notes }),
  }), [draft, conversationConfig, requestEvaluation])
  const artifactEvaluate = useCallback((content: string, metadata: Record<string, unknown>) => requestEvaluation({ content, metadata }), [requestEvaluation])

  if (draft.exercise_type === 'real_time_conversation') return <ConversationExercise
    exercise={{ ...draft, id: 0 }} scenario={conversationConfig.scenario} maxMinutes={conversationConfig.max_minutes}
    passingScore={conversationConfig.passing_score} isExerciseCompleted={false} dailyAttemptsUsed={0} maxDailyAttempts={0}
    initialResult={null} preview={voicePreview} />
  if (draft.exercise_type === 'artifact' && typeof config.artifact_html === 'string' && config.artifact_html) return <ArtifactExercise
    exercise={{ ...draft, id: 0, exercise_config: { artifact_html: config.artifact_html } }}
    isExerciseCompleted={false} passingScore={passingScore} evaluateSubmission={artifactEvaluate} />

  return <div className="flex flex-col gap-6">
    <div><h3 className="mb-3 text-lg font-semibold">{draft.title}</h3><ExerciseBrief instructions={draft.instructions} /></div>
    {draft.exercise_type === 'audio_evaluation' || draft.exercise_type === 'video_evaluation' ? <div className="flex flex-col gap-3">
      {typeof config.topic_prompt === 'string' && <p className="whitespace-pre-wrap">{config.topic_prompt}</p>}
      <p className="text-sm text-muted-foreground">{t('mediaLimit')}</p>
      {draft.exercise_type === 'audio_evaluation'
        ? <MediaRecorder onRecordingComplete={evaluateMedia} isSubmitting={busy} minDurationSeconds={typeof config.min_duration_seconds === 'number' ? config.min_duration_seconds : 5} maxDurationSeconds={typeof config.max_duration_seconds === 'number' ? config.max_duration_seconds : 300} />
        : <VideoRecorder onRecordingComplete={evaluateMedia} isSubmitting={busy} minDurationSeconds={typeof config.min_duration_seconds === 'number' ? config.min_duration_seconds : 5} maxDurationSeconds={typeof config.max_duration_seconds === 'number' ? config.max_duration_seconds : 300} />}
    </div> : draft.exercise_type === 'coding_challenge' ? <CodePreview files={snapshot.files} activeFile={snapshot.activeFile} visibleFiles={snapshot.visibleFiles} busy={busy} onEvaluate={(content) => void evaluate({ content })} />
    : <form onSubmit={(event) => { event.preventDefault(); void evaluate(questions ? { answers: questions.map((question) => ({ questionId: question.id, value: answers[question.id] ?? '' })) } : { content }) }}>
      <FieldGroup>
        {questions ? questions.map((question) => <Field key={question.id}>
          <FieldLabel htmlFor={`preview-${question.id}`}>{question.prompt}</FieldLabel>
          {question.type === 'fill_in_the_blank' ? <Input id={`preview-${question.id}`} value={String(answers[question.id] ?? '')} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))} />
            : <RadioGroup aria-label={question.prompt} value={String(answers[question.id] ?? '')} onValueChange={(value) => setAnswers((previous) => ({ ...previous, [question.id]: question.type === 'true_false' ? value === 'true' : Number(value) }))}>
              {(question.type === 'true_false' ? [{ value: 'true', label: t('true') }, { value: 'false', label: t('false') }] : (question.options ?? []).map((label, index) => ({ value: String(index), label }))).map((option) => <Field key={option.value} orientation="horizontal">
                <RadioGroupItem id={`preview-${question.id}-${option.value}`} value={option.value} /><FieldLabel htmlFor={`preview-${question.id}-${option.value}`}>{option.label}</FieldLabel>
              </Field>)}
            </RadioGroup>}
        </Field>) : <Field>
          <FieldLabel htmlFor="preview-answer">{t('answer')}</FieldLabel>
          <Textarea id="preview-answer" rows={8} maxLength={60_000} value={content} onChange={(event) => setContent(event.target.value)} placeholder={t('answerPlaceholder')} />
          <FieldDescription>{t('answerHint')}</FieldDescription>
        </Field>}
        <Button type="submit" disabled={busy || (!questions && !content.trim())}>{busy ? t('evaluating') : t('evaluate')}</Button>
      </FieldGroup>
    </form>}
    {busy && <p role="status">{t('evaluating')}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <ExerciseResultSummary score={result.score} passed={result.passed} passingScore={result.passingScore}
      feedback={result.metrics ? null : result.feedback}
      strengths={result.metrics ? [] : result.strengths} improvements={result.metrics ? [] : result.improvements}>
      {result.evaluator === 'deterministic' && <p className="text-sm text-muted-foreground">{t('deterministic')}</p>}
      {result.perQuestion?.map((item) => <p key={item.questionId} className="text-sm">{questions?.find((question) => question.id === item.questionId)?.prompt}: {item.correct ? t('correct') : t('incorrect')} · {typeof item.correctValue === 'boolean' ? t(item.correctValue ? 'true' : 'false') : String(item.correctValue ?? '')} {item.explanation}</p>)}
      {result.metrics && result.annotated_transcript && <SpeechFeedback evaluation={result as SpeechEvaluation} />}
    </ExerciseResultSummary>}
  </div>
}
