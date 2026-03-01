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
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface ExerciseBuilderProps {
  courseId: number
  lessonId?: number
  initialData?: any
}

type ExerciseStep = 'details' | 'ai-config'

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
  })

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

      const exerciseData = {
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
      setError(err.message || 'Failed to save exercise')
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
    {
      key: 'ai-config',
      label: t('aiConfigTitle'),
      icon: <IconRobot className="h-4 w-4" />,
      complete: hasAIConfig,
    },
  ]

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
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
              <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
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
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── STEP 1: Details ─────────────────────────────── */}
      {activeStep === 'details' && (
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 max-w-3xl">
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
              rows={3}
              className="resize-none border-muted bg-muted/30 transition-colors focus:bg-background"
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
                  <span className="text-xs text-muted-foreground">min</span>
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
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
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
        <div className="animate-in fade-in slide-in-from-left-2 duration-300 max-w-3xl">
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
              className="resize-none border-muted bg-muted/30 transition-colors focus:bg-background"
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
                className="resize-none rounded-none border-0 bg-transparent font-mono text-[13px] leading-6 text-[#cdd6f4] caret-[#89b4fa] placeholder:text-white/20 focus-visible:ring-0 focus-visible:ring-offset-0"
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
    </div>
  )
}
