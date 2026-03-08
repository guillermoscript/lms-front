'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImprovedTemplateSelector } from './improved-template-selector'
import { AIPreviewModal } from './ai-preview-modal'
import { VersionHistorySheet } from './version-history-sheet'
import {
  IconLoader2,
  IconDeviceFloppy,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconRobot,
  IconSparkles,
  IconSettings2,
  IconChevronRight,
  IconFlame,
  IconClock,
  IconEye,
  IconMicrophone,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface ExerciseBuilderProps {
  courseId: number
  lessonId?: number
  initialData?: any
}

type ExerciseStep = 'details' | 'ai-config' | 'audio-config'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
}

const TYPE_ICONS: Record<string, string> = {
  essay: '📝',
  coding_challenge: '💻',
  quiz: '❓',
  discussion: '💬',
}

export function ExerciseBuilder({ courseId, lessonId, initialData }: ExerciseBuilderProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [activeStep, setActiveStep] = useState<ExerciseStep>('details')

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    instructions: initialData?.instructions || '',
    exercise_type: initialData?.exercise_type || 'essay',
    difficulty_level: initialData?.difficulty_level || 'medium',
    time_limit: initialData?.time_limit || 30,
    system_prompt: initialData?.system_prompt || '',
    status: initialData?.status || 'draft',
    // audio/video exercise config
    topic_prompt: initialData?.exercise_config?.topic_prompt || '',
    min_duration_seconds: initialData?.exercise_config?.min_duration_seconds || 30,
    max_duration_seconds: initialData?.exercise_config?.max_duration_seconds || 300,
    passing_score: initialData?.exercise_config?.passing_score ?? 70,
    max_daily_attempts: initialData?.exercise_config?.max_daily_attempts ?? 5,
    rubric_filler_words: initialData?.exercise_config?.rubric?.filler_words !== false,
    rubric_pace: initialData?.exercise_config?.rubric?.pace !== false,
    rubric_structure: initialData?.exercise_config?.rubric?.structure !== false,
    rubric_confidence: initialData?.exercise_config?.rubric?.confidence !== false,
  })

  const isAudioType = formData.exercise_type === 'audio_evaluation' || formData.exercise_type === 'video_evaluation'

  const updateField = useCallback(
    <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [saveSuccess])

  const handleSave = async (publish: boolean) => {
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const exerciseData: Record<string, unknown> = {
        course_id: courseId,
        lesson_id: lessonId || null,
        title: formData.title,
        description: formData.description,
        instructions: formData.instructions,
        exercise_type: formData.exercise_type,
        difficulty_level: formData.difficulty_level,
        time_limit: formData.time_limit,
        system_prompt: formData.system_prompt,
        status: publish ? 'published' : formData.status,
        created_by: user.id,
      }

      if (isAudioType) {
        exerciseData.exercise_config = {
          stt_provider: 'assemblyai',
          ai_coach: 'openai',
          topic_prompt: formData.topic_prompt,
          min_duration_seconds: formData.min_duration_seconds,
          max_duration_seconds: formData.max_duration_seconds,
          passing_score: formData.passing_score,
          max_daily_attempts: formData.max_daily_attempts || 0, // 0 = unlimited
          rubric: {
            filler_words: formData.rubric_filler_words,
            pace: formData.rubric_pace,
            structure: formData.rubric_structure,
            confidence: formData.rubric_confidence,
          },
        }
      }

      if (initialData) {
        const { error: updateError } = await supabase
          .from('exercises')
          .update(exerciseData)
          .eq('id', initialData.id)
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from('exercises')
          .insert([exerciseData])
        if (insertError) throw insertError
      }

      if (publish) {
        router.push(`/dashboard/teacher/courses/${courseId}/exercises`)
        router.refresh()
      } else {
        setSaveSuccess(true)
        setLoading(false)
      }
    } catch (err: any) {
      console.error(err)
      setError(err.message || t('saveError'))
      setLoading(false)
    }
  }

  // Completion checks
  const isDetailsComplete = formData.title.trim().length > 0
  const hasAIConfig =
    formData.instructions.trim().length > 0 ||
    formData.system_prompt.trim().length > 0

  const steps: {
    key: ExerciseStep
    label: string
    icon: React.ReactNode
    complete: boolean
  }[] = [
      {
        key: 'details',
        label: t('details'),
        icon: <IconSettings2 className="h-4 w-4" />,
        complete: isDetailsComplete,
      },
      ...(isAudioType ? [{
        key: 'audio-config' as ExerciseStep,
        label: t('audioSetupTitle'),
        icon: <IconMicrophone className="h-4 w-4" />,
        complete: formData.topic_prompt.trim().length > 0,
      }] : [{
        key: 'ai-config' as ExerciseStep,
        label: t('aiConfigTitle'),
        icon: <IconRobot className="h-4 w-4" />,
        complete: hasAIConfig,
      }]),
    ]

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75 fill-mode-both">
        {/* Step nav */}
        <nav className="flex items-center gap-1 rounded-lg bg-muted/50 p-1 w-fit">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={cn(
                'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                activeStep === step.key
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  step.complete
                    ? 'bg-emerald-500/15 text-emerald-600'
                    : activeStep === step.key
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {step.complete ? <IconCheck className="h-3 w-3" /> : i + 1}
              </span>
              {step.label}
            </button>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {initialData && (
            <VersionHistorySheet
              contentType="exercise"
              contentId={initialData.id}
              currentSnapshot={formData}
              onRestore={() => router.refresh()}
            />
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => handleSave(false)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : saveSuccess ? (
              <IconCheck className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <IconDeviceFloppy className="h-3.5 w-3.5" />
            )}
            {t('saveDraft')}
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => handleSave(true)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <IconEye className="h-3.5 w-3.5" />
            )}
            {t('publishExercise')}
          </Button>
        </div>
      </div>

      {/* ── Error Banner ────────────────────────────────── */}
      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive/60 hover:text-destructive"
            aria-label={t('dismissError')}
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── STEP 1: Details ─────────────────────────────── */}
      {activeStep === 'details' && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 ">
          {/* Title — large borderless input */}
          <div className="mb-8">
            <input
              type="text"
              value={formData.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder={t('titlePlaceholder')}
              className="w-full border-0 bg-transparent text-3xl font-bold tracking-tight placeholder:text-muted-foreground/40 focus:outline-none focus:ring-0"
              autoFocus
            />
            <div className="mt-1 h-px bg-border" />
          </div>

          {/* Description */}
          <div className="mb-8">
            <Label
              htmlFor="description"
              className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
            >
              {t('descriptionLabel')}
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder={t('descriptionPlaceholder')}
              rows={7}
              className="border-muted bg-muted/30 transition-colors focus:bg-background"
            />
          </div>

          {/* Configuration grid */}
          <div className="mb-8">
            <h3 className="mb-4 text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <IconSettings2 className="h-3.5 w-3.5" />
              {t('configSection')}
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Exercise Type */}
              <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('typeLabel')}
                </Label>
                <Select
                  value={formData.exercise_type}
                  onValueChange={(val) => val && updateField('exercise_type', val)}
                >
                  <SelectTrigger className="h-10 border-muted bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="essay">
                      <span className="flex items-center gap-2">
                        <span>📝</span> {t('typeEssay')}
                      </span>
                    </SelectItem>
                    <SelectItem value="coding_challenge">
                      <span className="flex items-center gap-2">
                        <span>💻</span> {t('typeCoding')}
                      </span>
                    </SelectItem>
                    <SelectItem value="quiz">
                      <span className="flex items-center gap-2">
                        <span>❓</span> {t('typeQuiz')}
                      </span>
                    </SelectItem>
                    <SelectItem value="discussion">
                      <span className="flex items-center gap-2">
                        <span>💬</span> {t('typeDiscussion')}
                      </span>
                    </SelectItem>
                    <SelectItem value="audio_evaluation">
                      <span className="flex items-center gap-2">
                        <span>🎙️</span> {t('typeAudio')}
                      </span>
                    </SelectItem>
                    <SelectItem value="video_evaluation">
                      <span className="flex items-center gap-2">
                        <span>🎥</span> {t('typeVideo')}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Difficulty */}
              <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  <IconFlame className="mr-1 inline h-3 w-3" />
                  {t('difficultyLabel')}
                </Label>
                <div className="flex gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateField('difficulty_level', level)}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-all',
                        formData.difficulty_level === level
                          ? DIFFICULTY_COLORS[level]
                          : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {t(`difficulty${level.charAt(0).toUpperCase() + level.slice(1)}` as any)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Limit */}
              <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  <IconClock className="mr-1 inline h-3 w-3" />
                  {t('timeLimitLabel')}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={formData.time_limit}
                    onChange={(e) =>
                      updateField('time_limit', parseInt(e.target.value) || 0)
                    }
                    className="h-10 w-20 border-muted bg-muted/30 text-center"
                  />
                  <span className="text-xs text-muted-foreground">{t('timeLimitUnit')}</span>
                </div>
              </div>

              {/* Status */}
              <div className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('statusLabel')}
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(val) => val && updateField('status', val)}
                >
                  <SelectTrigger className="h-10 border-muted bg-muted/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">{t('statusDraft')}</SelectItem>
                    <SelectItem value="published">{t('statusPublished')}</SelectItem>
                    <SelectItem value="archived">{t('statusArchived')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Next step prompt */}
          <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 p-6 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              {formData.title ? t('readyForAI') : t('enterTitleFirst')}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveStep('ai-config')}
              disabled={!formData.title}
              className="gap-2"
            >
              {t('configureAI')}
              <IconChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 2: AI Configuration ────────────────────── */}
      {activeStep === 'ai-config' && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 ">
          {/* Header */}
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
              <IconRobot className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">
                {t('aiConfigTitle')}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t('aiConfigDesc')}
              </p>
            </div>
          </div>

          {/* Student Instructions */}
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Label
                htmlFor="instructions"
                className="text-sm font-medium"
              >
                {t('studentInsLabel')}
              </Label>
              <Badge
                variant="outline"
                className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              >
                <IconEye className="mr-1 h-2.5 w-2.5" />
                {t('visibleToStudents')}
              </Badge>
            </div>
            <Textarea
              id="instructions"
              value={formData.instructions}
              onChange={(e) => updateField('instructions', e.target.value)}
              placeholder={t('studentInsPlaceholder')}
              rows={5}
              className="border-muted bg-muted/30 transition-colors focus:bg-background"
            />
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              {t('studentInsHint')}
            </p>
          </div>

          <Separator className="my-6" />

          {/* System Prompt */}
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <Label
                htmlFor="system_prompt"
                className="text-sm font-medium"
              >
                {t('aiSystemPromptLabel')}
              </Label>
              <Badge
                variant="secondary"
                className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
              >
                {t('hiddenFromStudents')}
              </Badge>
            </div>
            <div className="overflow-hidden rounded-xl border bg-[#1e1e2e]">
              <div className="flex items-center gap-2 border-b border-white/10 bg-white/5 px-4 py-2">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
                </div>
                <span className="text-[10px] text-white/30 ml-1">
                  system_prompt
                </span>
              </div>
              <Textarea
                id="system_prompt"
                value={formData.system_prompt}
                onChange={(e) => updateField('system_prompt', e.target.value)}
                placeholder={t('aiSystemPromptPlaceholder')}
                rows={8}
                className="rounded-none border-0 bg-transparent font-mono text-[13px] leading-6 text-[#cdd6f4] caret-[#89b4fa] placeholder:text-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Template + Preview actions */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-4">
            <ImprovedTemplateSelector
              category="exercise"
              onApply={(data) => {
                setFormData((prev) => ({
                  ...prev,
                  instructions: data.instructions,
                  system_prompt: data.system_prompt,
                }))
              }}
            />
            <AIPreviewModal
              type="exercise"
              config={{
                system_prompt: formData.system_prompt,
                instructions: formData.instructions,
              }}
            />
          </div>
        </div>
      )}

      {/* ── STEP: Audio Configuration ────────────────────── */}
      {activeStep === 'audio-config' && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300  space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/10">
              <IconMicrophone className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('audioSetupTitle')}</h2>
              <p className="text-sm text-muted-foreground">{t('audioSetupDesc')}</p>
            </div>
          </div>

          {/* Topic Prompt */}
          <div>
            <Label htmlFor="topic_prompt" className="mb-2 flex items-center gap-2 text-sm font-medium">
              {t('topicPromptLabel')}
              <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                <IconEye className="mr-1 h-2.5 w-2.5" />
                {t('visibleToStudents')}
              </Badge>
            </Label>
            <Textarea
              id="topic_prompt"
              value={formData.topic_prompt}
              onChange={(e) => updateField('topic_prompt', e.target.value)}
              placeholder={t('topicPromptPlaceholder')}
              rows={7}
              className="border-muted bg-muted/30 transition-colors focus:bg-background"
            />
            <p className="mt-1.5 text-xs text-muted-foreground/70">
              {t('topicPromptHint')}
            </p>
          </div>

          <Separator className="my-2" />

          {/* Duration */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('recordingDuration')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  <IconClock className="mr-1 inline h-3 w-3" />
                  {t('minDurationLabel')}
                </Label>
                <Input
                  type="number"
                  min={5}
                  max={60}
                  value={formData.min_duration_seconds}
                  onChange={(e) => updateField('min_duration_seconds', parseInt(e.target.value) || 5)}
                  className="h-10 border-muted bg-muted/30 text-center"
                />
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  <IconClock className="mr-1 inline h-3 w-3" />
                  {t('maxDurationLabel')}
                </Label>
                <Input
                  type="number"
                  min={30}
                  max={600}
                  value={formData.max_duration_seconds}
                  onChange={(e) => updateField('max_duration_seconds', parseInt(e.target.value) || 300)}
                  className="h-10 border-muted bg-muted/30 text-center"
                />
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Student Limits — Passing Score & Daily Attempts */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('studentLimits')}</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-card p-4">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('passingScoreLabel')}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formData.passing_score}
                  onChange={(e) => updateField('passing_score', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                  className="h-10 border-muted bg-muted/30 text-center"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  {t('passingScoreHint')}
                </p>
              </div>
              <div className="rounded-xl border bg-card p-4">
                <Label className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('dailyAttemptsLabel')}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={formData.max_daily_attempts}
                  onChange={(e) => updateField('max_daily_attempts', Math.max(0, parseInt(e.target.value) || 0))}
                  className="h-10 border-muted bg-muted/30 text-center"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                  {t('dailyAttemptsHint')}
                </p>
              </div>
            </div>
          </div>

          <Separator className="my-2" />

          {/* Rubric */}
          <div>
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('evaluationRubric')}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                { key: 'rubric_filler_words', label: t('rubricFillerWords'), desc: t('rubricFillerWordsDesc') },
                { key: 'rubric_pace', label: t('rubricPace'), desc: t('rubricPaceDesc') },
                { key: 'rubric_structure', label: t('rubricStructure'), desc: t('rubricStructureDesc') },
                { key: 'rubric_confidence', label: t('rubricConfidence'), desc: t('rubricConfidenceDesc') },
              ] as const).map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateField(key, !formData[key])}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                    formData[key]
                      ? 'border-primary/30 bg-primary/5'
                      : 'border-transparent bg-muted/40 text-muted-foreground hover:bg-muted'
                  )}
                >
                  <span className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    formData[key] ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'
                  )}>
                    {formData[key] && <IconCheck className="h-2.5 w-2.5" />}
                  </span>
                  <div>
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
