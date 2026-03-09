'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  IconLoader2,
  IconArrowLeft,
  IconEye,
  IconEyeOff,
  IconCode,
  IconDeviceFloppy,
  IconRobot,
  IconLayoutGrid,
  IconCheck,
  IconAlertTriangle,
  IconChevronRight,
  IconFileText,
  IconVideo,
  IconSparkles,
  IconX,
} from '@tabler/icons-react'
import { MDXPreview } from './mdx-preview'
import { ImprovedTemplateSelector } from './improved-template-selector'
import { AIPreviewModal } from './ai-preview-modal'
import { VersionHistorySheet } from './version-history-sheet'
import { BlockEditor } from './block-editor'
import MarkdownEditor from './markdown-editor'
import { cn } from '@/lib/utils'

interface LessonEditorProps {
  courseId: number
  courseTitle: string
  initialSequence: number
  initialData?: {
    id: number
    title: string
    description: string | null
    content: string | null
    video_url: string | null
    sequence: number
    status: 'draft' | 'published' | 'archived'
    ai_task_description: string | null
    ai_task_instructions: string | null
  }
}

type EditorStep = 'details' | 'content' | 'ai-task'

export function LessonEditor({
  courseId,
  courseTitle,
  initialSequence,
  initialData,
}: LessonEditorProps) {
  const router = useRouter()
  const t = useTranslations('dashboard.teacher.lessonEditor')
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<EditorStep>('details')
  const [showPreview, setShowPreview] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [contentMode, setContentMode] = useState<'visual' | 'mdx'>('visual')
  const contentAreaRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    content:
      initialData?.content ??
      (initialData
        ? ''
        : `# Nuevo tema\n\nEscribe el contenido de la lección aquí...\n\n<Callout type="info">Añade los objetivos de aprendizaje aquí</Callout>`),
    video_url: initialData?.video_url || '',
    sequence: initialData?.sequence || initialSequence,
    ai_task_description: initialData?.ai_task_description || '',
    ai_task_instructions: initialData?.ai_task_instructions || '',
  })

  const contentLineCount = useMemo(
    () => (formData.content || '').split('\n').length,
    [formData.content]
  )

  const updateField = useCallback(
    <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
      setFormData((prev) => ({ ...prev, [key]: value }))
    },
    []
  )

  // Clear success indicator after 2s
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
      const lessonData = {
        course_id: courseId,
        title: formData.title,
        description: formData.description || null,
        content: formData.content || null,
        video_url: formData.video_url || null,
        sequence: formData.sequence,
        status: publish ? ('published' as const) : ('draft' as const),
      }

      let lessonId: number | undefined = initialData?.id

      if (initialData) {
        const { error: updateError } = await supabase
          .from('lessons')
          .update(lessonData)
          .eq('id', initialData.id)

        if (updateError) throw updateError
      } else {
        const { data: newLesson, error: insertError } = await supabase
          .from('lessons')
          .insert([lessonData])
          .select('id')
          .single()

        if (insertError) throw insertError
        lessonId = newLesson.id
      }

      if (
        lessonId &&
        (formData.ai_task_description || formData.ai_task_instructions)
      ) {
        const { error: taskError } = await supabase
          .from('lessons_ai_tasks')
          .upsert(
            {
              lesson_id: lessonId,
              task_instructions: formData.ai_task_description || '',
              system_prompt: formData.ai_task_instructions || '',
            },
            { onConflict: 'lesson_id' }
          )

        if (taskError) throw taskError
      }

      if (publish) {
        router.push(`/dashboard/teacher/courses/${courseId}`)
      } else {
        setSaveSuccess(true)
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Error saving lesson:', err)
      setError(err.message || t('saveError'))
      setLoading(false)
    }
  }

  // Completion checks for steps
  const isDetailsComplete = formData.title.trim().length > 0
  const isContentComplete = (formData.content?.trim().length ?? 0) > 20
  const hasAITask =
    formData.ai_task_description.trim().length > 0 ||
    formData.ai_task_instructions.trim().length > 0

  const steps: { key: EditorStep; label: string; icon: React.ReactNode; complete: boolean }[] = [
    {
      key: 'details',
      label: t('details'),
      icon: <IconFileText className="h-4 w-4" />,
      complete: isDetailsComplete,
    },
    {
      key: 'content',
      label: t('contentLabel'),
      icon: <IconLayoutGrid className="h-4 w-4" />,
      complete: isContentComplete,
    },
    {
      key: 'ai-task',
      label: t('aiTaskTitle'),
      icon: <IconRobot className="h-4 w-4" />,
      complete: hasAITask,
    },
  ]

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <header data-tour="lesson-header" className="flex-none border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
          {/* Left: back + breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/dashboard/teacher/courses/${courseId}`}>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" aria-label={t('backToCourse', { course: courseTitle })}>
                <IconArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground min-w-0">
              <span className="truncate max-w-[120px] lg:max-w-[200px]">{courseTitle}</span>
              <IconChevronRight className="h-3 w-3 shrink-0" />
              <span className="font-medium text-foreground truncate">
                {initialData ? t('editTitle') : t('createTitle')}
              </span>
            </div>
          </div>

          {/* Center: step nav (desktop) */}
          <nav data-tour="lesson-steps" className="hidden md:flex items-center gap-1 rounded-lg bg-muted/50 p-1">
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
                  {step.complete ? (
                    <IconCheck className="h-3 w-3" />
                  ) : (
                    i + 1
                  )}
                </span>
                {step.label}
              </button>
            ))}
          </nav>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {initialData && (
              <VersionHistorySheet
                contentType="lesson"
                contentId={initialData.id}
                currentSnapshot={formData}
                onRestore={() => router.refresh()}
              />
            )}

            <Button
              data-tour="lesson-preview"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={() => setShowPreview(!showPreview)}
            >
              {showPreview ? (
                <IconEyeOff className="h-4 w-4" />
              ) : (
                <IconEye className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">{t('previewTitle')}</span>
            </Button>

            <Separator orientation="vertical" className="h-6" />

            <div data-tour="lesson-save" className="flex items-center gap-2">
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
              <span className="hidden sm:inline">{t('saveDraft')}</span>
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
              {t('publishLesson')}
            </Button>
            </div>
          </div>
        </div>

        {/* Mobile step nav */}
        <div className="flex md:hidden items-center gap-1 px-4 pb-2 overflow-x-auto">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-all',
                activeStep === step.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {step.complete && <IconCheck className="h-3 w-3" />}
              {step.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── Error Banner ────────────────────────────────────── */}
      {error && (
        <div className="flex-none border-b border-destructive/20 bg-destructive/5 px-4 py-2.5">
          <div className="mx-auto flex max-w-4xl items-center gap-2">
            <IconAlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <p className="text-sm text-destructive flex-1">{error}</p>
            <button type="button" onClick={() => setError(null)} className="text-destructive/60 hover:text-destructive" aria-label={t('dismissError')}>
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main Content Area ───────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden" ref={contentAreaRef}>
        {/* Editor Panel */}
        <div
          className={cn(
            'flex-1 overflow-y-auto transition-all duration-300',
            showPreview ? 'lg:w-1/2' : 'w-full'
          )}
        >
          <div className="mx-auto max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
            {/* ── STEP 1: Details ────────────────────────────── */}
            {activeStep === 'details' && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                {/* Title - large, prominent input */}
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
                <div className="mb-6">
                  <Label
                    htmlFor="description"
                    className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    <IconFileText className="h-3.5 w-3.5" />
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

                {/* Video URL */}
                <div className="mb-6">
                  <Label
                    htmlFor="video_url"
                    className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    <IconVideo className="h-3.5 w-3.5" />
                    {t('videoUrlLabel')}
                  </Label>
                  <Input
                    id="video_url"
                    type="url"
                    value={formData.video_url}
                    onChange={(e) => updateField('video_url', e.target.value)}
                    placeholder={t('videoUrlPlaceholder')}
                    className="border-muted bg-muted/30 transition-colors focus:bg-background"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground/70">
                    {t('videoUrlHint')}
                  </p>

                  {/* Video embed preview */}
                  {formData.video_url && formData.video_url.includes('youtube') && (
                    <div className="mt-3 overflow-hidden rounded-lg border bg-muted/30">
                      <div className="aspect-video">
                        <iframe
                          src={formData.video_url
                            .replace('watch?v=', 'embed/')
                            .replace('youtu.be/', 'youtube.com/embed/')}
                          className="h-full w-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Lesson order */}
                <div className="mb-8">
                  <Label
                    htmlFor="sequence"
                    className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground"
                  >
                    {t('sequenceLabel')}
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="sequence"
                      type="number"
                      min="1"
                      value={formData.sequence}
                      onChange={(e) =>
                        updateField('sequence', parseInt(e.target.value) || 1)
                      }
                      className="w-20 border-muted bg-muted/30 text-center transition-colors focus:bg-background"
                    />
                    <p className="text-xs text-muted-foreground/70">
                      {t('sequenceHint')}
                    </p>
                  </div>
                </div>

                {/* Next step prompt */}
                <div className="rounded-xl border border-dashed border-muted-foreground/20 bg-muted/20 p-6 text-center">
                  <p className="mb-3 text-sm text-muted-foreground">
                    {formData.title
                      ? t('readyForContent')
                      : t('enterTitleFirst')}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveStep('content')}
                    disabled={!formData.title}
                    className="gap-2"
                  >
                    {t('writeContent')}
                    <IconChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {/* ── STEP 2: Content ───────────────────────────── */}
            {activeStep === 'content' && (
              <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Editor mode toolbar */}
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {formData.title && (
                      <h2 className="text-lg font-semibold tracking-tight text-muted-foreground/80">
                        {formData.title}
                      </h2>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground/50 mr-1">
                      {t('editorMode')}
                    </span>
                    <div data-tour="lesson-editor-mode" className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
                      <button
                        type="button"
                        onClick={() => setContentMode('visual')}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                          contentMode === 'visual'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <IconLayoutGrid className="h-3.5 w-3.5" />
                        {t('modeVisual')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setContentMode('mdx')}
                        className={cn(
                          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                          contentMode === 'mdx'
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        <IconCode className="h-3.5 w-3.5" />
                        {t('modeMDX')}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Visual Block Editor */}
                {contentMode === 'visual' && (
                  <div className="animate-in fade-in duration-200">
                    <BlockEditor
                      initialContent={formData.content || ''}
                      onChange={(mdx) => updateField('content', mdx)}
                    />
                  </div>
                )}

                {/* MDX Code Editor */}
                {contentMode === 'mdx' && (
                  <div className="animate-in fade-in duration-200">
                    <div className="overflow-hidden rounded-xl border bg-[#1e1e2e] shadow-lg">
                      {/* MDX editor toolbar */}
                      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1.5">
                            <div className="h-3 w-3 rounded-full bg-red-500/70" />
                            <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                            <div className="h-3 w-3 rounded-full bg-green-500/70" />
                          </div>
                          <span className="ml-2 text-[11px] font-medium text-white/40">
                            lesson.mdx
                          </span>
                        </div>
                        <span className="text-[10px] text-white/30">
                          {contentLineCount} {t('lines')}
                        </span>
                      </div>
                      {/* Editor area */}
                      <div className="p-0">
                        <MarkdownEditor
                          value={formData.content || ''}
                          onChange={(val) => updateField('content', val)}
                          placeholder={t('contentPlaceholder') as string}
                          rows={28}
                          className="[&_textarea]:bg-transparent [&_textarea]:text-[#cdd6f4] [&_textarea]:caret-[#89b4fa] [&_textarea]:placeholder:text-white/20 [&_textarea]:border-0 [&_textarea]:rounded-none [&_textarea]:font-mono [&_textarea]:text-[13px] [&_textarea]:leading-6 [&_.btn-sm]:bg-white/10 [&_.btn-sm]:text-white/60 [&_.btn-sm]:border-white/10 [&_.btn-sm]:hover:bg-white/20 [&_.btn-sm]:hover:text-white/80 [&>div:first-child]:px-4 [&>div:first-child]:py-2 [&>div:first-child]:border-b [&>div:first-child]:border-white/10"
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground/50">
                      {t('contentHint')}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 3: AI Task ───────────────────────────── */}
            {activeStep === 'ai-task' && (
              <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10">
                      <IconRobot className="h-5 w-5 text-violet-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight">{t('aiTaskTitle')}</h2>
                      <p className="text-sm text-muted-foreground">
                        {t('aiTaskDescription')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Optional badge */}
                <div className="mb-6 flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <IconSparkles className="mr-1 h-3 w-3" />
                    {t('optional')}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {t('aiTaskOptionalHint')}
                  </span>
                </div>

                {/* Task prompt for students */}
                <div className="mb-6">
                  <Label
                    htmlFor="ai_task_description"
                    className="mb-2 block text-sm font-medium"
                  >
                    {t('aiTaskPromptLabel')}
                  </Label>
                  <Textarea
                    id="ai_task_description"
                    value={formData.ai_task_description}
                    onChange={(e) =>
                      updateField('ai_task_description', e.target.value)
                    }
                    placeholder={t('aiTaskPromptPlaceholder')}
                    rows={4}
                    className="resize-none border-muted bg-muted/30 transition-colors focus:bg-background"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground/70">
                    {t('aiTaskPromptHint')}
                  </p>
                </div>

                {/* AI grading instructions */}
                <div className="mb-6">
                  <Label
                    htmlFor="ai_task_instructions"
                    className="mb-2 block text-sm font-medium"
                  >
                    {t('aiGradingInsLabel')}
                  </Label>
                  <Textarea
                    id="ai_task_instructions"
                    value={formData.ai_task_instructions}
                    onChange={(e) =>
                      updateField('ai_task_instructions', e.target.value)
                    }
                    placeholder={t('aiGradingInsPlaceholder')}
                    rows={5}
                    className="resize-none border-muted bg-muted/30 font-mono text-sm transition-colors focus:bg-background"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground/70">
                    {t('aiGradingInsHint')}
                  </p>
                </div>

                {/* Template & Preview buttons */}
                <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/20 p-4">
                  <ImprovedTemplateSelector
                    category="lesson_task"
                    onApply={(data) => {
                      setFormData((prev) => ({
                        ...prev,
                        ai_task_description: data.instructions,
                        ai_task_instructions: data.system_prompt,
                      }))
                    }}
                  />
                  <AIPreviewModal
                    type="lesson"
                    config={{
                      task_description: formData.ai_task_description,
                      system_prompt: formData.ai_task_instructions,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Preview Panel (slide-in) ──────────────────────── */}
        <div
          className={cn(
            'hidden lg:flex flex-col border-l bg-muted/20 transition-all duration-300 overflow-hidden',
            showPreview ? 'w-1/2 opacity-100' : 'w-0 opacity-0'
          )}
        >
          {showPreview && (
            <>
              <div className="flex h-12 items-center justify-between border-b px-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconEye className="h-4 w-4" />
                  {t('previewTitle')}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowPreview(false)}
                  aria-label={t('closePreview')}
                >
                  <IconX className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <article className="prose prose-neutral dark:prose-invert max-w-none">
                  {formData.title && (
                    <h1 className="mb-3 text-2xl font-bold tracking-tight">
                      {formData.title}
                    </h1>
                  )}

                  {formData.description && (
                    <p className="mb-6 text-muted-foreground leading-relaxed">
                      {formData.description}
                    </p>
                  )}

                  {formData.video_url && (
                    <div className="mb-6 aspect-video overflow-hidden rounded-lg bg-muted">
                      <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        Video: {formData.video_url}
                      </p>
                    </div>
                  )}

                  {formData.content ? (
                    <MDXPreview content={formData.content} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 rounded-full bg-muted p-3">
                        <IconFileText className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('previewWriting')}
                      </p>
                    </div>
                  )}
                </article>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Bottom Bar (mobile) ─────────────────────────────── */}
      <footer className="flex-none border-t bg-background p-3 lg:hidden">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 gap-1.5"
            size="sm"
            onClick={() => handleSave(false)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <IconDeviceFloppy className="h-3.5 w-3.5" />
            )}
            {t('saveDraft')}
          </Button>
          <Button
            className="flex-1 gap-1.5"
            size="sm"
            onClick={() => handleSave(true)}
            disabled={loading || !formData.title}
          >
            {loading ? (
              <IconLoader2 className="h-3.5 w-3.5 motion-safe:animate-spin" />
            ) : (
              <IconEye className="h-3.5 w-3.5" />
            )}
            {t('publishLesson')}
          </Button>
        </div>
      </footer>
    </div>
  )
}
