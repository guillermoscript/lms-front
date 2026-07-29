'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { IconChevronDown, IconVideo, IconRobot, IconFileText, IconClipboardList, IconTemplate, IconCode, IconEye } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

// Version content is MDX, so "rendered" has to compile it the way the lesson
// page does. Markdown-only rendering would silently drop the components.
const MDXPreview = dynamic(
  () => import('./mdx-preview').then((m) => m.MDXPreview),
  {
    ssr: false,
    loading: () => <div className="h-4 w-40 rounded bg-muted motion-safe:animate-pulse" />,
  }
)

interface VersionPreviewProps {
  contentType: 'lesson' | 'exam' | 'exercise' | 'prompt_template'
  snapshot: Record<string, unknown>
}

const PREVIEW_NS = 'dashboard.teacher.versionHistory.preview'

function StatusBadge({ status }: { status: string | undefined }) {
  const t = useTranslations(PREVIEW_NS)
  if (!status) return null
  const colors: Record<string, string> = {
    published: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    draft: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  }
  const known = status === 'published' || status === 'draft' || status === 'archived'
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border',
      !known && 'capitalize',
      colors[status] || 'bg-muted text-muted-foreground border-border'
    )}>
      {known ? t(`status.${status}` as 'status.published') : status}
    </span>
  )
}

function SectionBlock({
  icon: Icon,
  label,
  trailing,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  trailing?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
        </div>
        {trailing}
      </div>
      {children}
    </div>
  )
}

function ExpandableContent({ label, content, icon, maxLines = 8, renderable = false }: {
  label: string
  content: string
  icon?: React.ComponentType<{ className?: string }>
  maxLines?: number
  /** Lesson content is MDX and can be shown compiled; prompts stay as source. */
  renderable?: boolean
}) {
  const t = useTranslations(PREVIEW_NS)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'source' | 'rendered'>('source')

  const isRendered = renderable && view === 'rendered'
  const lineCount = content.split('\n').length
  const isTruncated = !open && (lineCount > maxLines || content.length > maxLines * 90)

  return (
    <SectionBlock
      icon={icon}
      label={label}
      trailing={
        renderable ? (
          <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setView('source')}
              aria-pressed={view === 'source'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                view === 'source'
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconCode aria-hidden="true" className="h-3.5 w-3.5" />
              {t('source')}
            </button>
            <button
              type="button"
              onClick={() => setView('rendered')}
              aria-pressed={view === 'rendered'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
                view === 'rendered'
                  ? 'bg-background text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <IconEye aria-hidden="true" className="h-3.5 w-3.5" />
              {t('rendered')}
            </button>
          </div>
        ) : undefined
      }
    >
      <div
        className={cn(
          'rounded-lg border p-4 text-sm leading-relaxed',
          isRendered ? 'bg-background' : 'bg-muted/40 font-mono whitespace-pre-wrap',
          open ? 'max-h-[28rem] overflow-y-auto' : 'overflow-hidden'
        )}
        style={
          open
            ? undefined
            : {
                display: '-webkit-box',
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: 'vertical' as const,
              }
        }
      >
        {isRendered ? <MDXPreview content={content} /> : content}
      </div>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <IconChevronDown
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
        />
        {open
          ? t('collapse')
          : isTruncated
            ? t('showAllLines', { count: lineCount })
            : t('showAll')}
      </button>
    </SectionBlock>
  )
}

function MetaPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/60 border text-xs">
      <span className="text-muted-foreground font-medium">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function LessonPreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const t = useTranslations(PREVIEW_NS)
  const title = snapshot.title as string | undefined
  const description = snapshot.description as string | undefined
  const content = snapshot.content as string | undefined
  const videoUrl = snapshot.video_url as string | undefined
  const status = snapshot.status as string | undefined
  const aiTaskDescription = snapshot.ai_task_description as string | undefined
  const aiTaskInstructions = snapshot.ai_task_instructions as string | undefined
  const aiTask = snapshot.ai_task as Record<string, unknown> | null | undefined

  // lessons_ai_tasks is the live source of truth, so a snapshot that recorded it
  // as null means there was no task — the legacy lesson columns can still hold a
  // removed one, and are only trusted for snapshots taken before that key existed.
  const snapshotHasTaskRow = 'ai_task' in snapshot
  const taskPrompt = snapshotHasTaskRow
    ? (aiTask?.task_instructions as string | undefined)
    : aiTaskDescription
  const systemPrompt = snapshotHasTaskRow
    ? (aiTask?.system_prompt as string | undefined)
    : aiTaskInstructions

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || t('untitledLesson')}</h3>
          <StatusBadge status={status} />
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Video */}
      {videoUrl && (
        <SectionBlock icon={IconVideo} label={t('video')}>
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/40 border font-mono text-sm truncate">
            {videoUrl}
          </div>
        </SectionBlock>
      )}

      {/* Content */}
      {content && (
        <ExpandableContent label={t('content')} content={content} icon={IconFileText} renderable />
      )}

      {/* AI Task */}
      {(taskPrompt || systemPrompt) && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <IconRobot className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              {t('aiTaskConfig')}
            </span>
          </div>
          {taskPrompt && (
            <ExpandableContent label={t('taskPrompt')} content={taskPrompt} maxLines={4} />
          )}
          {systemPrompt && (
            <ExpandableContent label={t('systemPrompt')} content={systemPrompt} maxLines={4} />
          )}
        </div>
      )}
    </div>
  )
}

function ExamPreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const t = useTranslations(PREVIEW_NS)
  const title = snapshot.title as string | undefined
  const description = snapshot.description as string | undefined
  const status = snapshot.status as string | undefined
  const duration = snapshot.duration as number | undefined
  const questions = (snapshot.questions as Array<Record<string, unknown>>) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || t('untitledExam')}</h3>
          <StatusBadge status={status} />
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2">
        {duration !== undefined && (
          <MetaPill label={t('duration')} value={t('durationValue', { minutes: duration })} />
        )}
        <MetaPill label={t('questions')} value={questions.length} />
      </div>

      {/* Questions */}
      {questions.length > 0 && (
        <SectionBlock icon={IconClipboardList} label={t('questions')}>
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded outline-none py-1">
              <IconChevronDown aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              <span>{t('showQuestions', { count: questions.length })}</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-xs font-bold text-primary shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <p className="text-sm font-medium leading-snug">{q.question_text as string}</p>
                      <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-tighter">
                        {q.question_type as string}
                      </Badge>
                    </div>
                  </div>
                  {(q.options as Array<Record<string, unknown>> | undefined)?.length ? (
                    <div className="ml-10 grid grid-cols-1 gap-1.5">
                      {(q.options as Array<Record<string, unknown>>).map((o, j) => (
                        <div
                          key={j}
                          className={cn(
                            'flex items-center gap-2.5 text-sm py-1.5 px-3 rounded-md',
                            o.is_correct
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-muted-foreground'
                          )}
                        >
                          <div className={cn(
                            'w-2 h-2 rounded-full shrink-0',
                            o.is_correct ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                          )} />
                          {o.option_text as string}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </SectionBlock>
      )}
    </div>
  )
}

function ExercisePreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const t = useTranslations(PREVIEW_NS)
  const title = snapshot.title as string | undefined
  const description = snapshot.description as string | undefined
  const status = snapshot.status as string | undefined
  const exerciseType = snapshot.exercise_type as string | undefined
  const difficultyLevel = snapshot.difficulty_level as string | undefined
  const instructions = snapshot.instructions as string | undefined
  const timeLimit = snapshot.time_limit as number | undefined

  const difficultyColors: Record<string, string> = {
    beginner: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    intermediate: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
    advanced: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || t('untitledExercise')}</h3>
          <div className="flex gap-2 shrink-0">
            <StatusBadge status={status} />
            {exerciseType && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-muted/50 capitalize">
                {exerciseType}
              </span>
            )}
          </div>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2">
        {difficultyLevel && (
          <span className={cn(
            'inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border capitalize',
            difficultyColors[difficultyLevel] || 'bg-muted text-muted-foreground border-border'
          )}>
            {difficultyLevel}
          </span>
        )}
        {timeLimit !== undefined && (
          <MetaPill label={t('timeLimit')} value={t('durationValue', { minutes: timeLimit })} />
        )}
      </div>

      {/* Instructions */}
      {instructions && (
        <ExpandableContent label={t('instructions')} content={instructions} icon={IconFileText} maxLines={6} />
      )}
    </div>
  )
}

function TemplatePreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const t = useTranslations(PREVIEW_NS)
  const name = snapshot.name as string | undefined
  const category = snapshot.category as string | undefined
  const description = snapshot.description as string | undefined
  const taskTemplate = snapshot.task_description_template as string | undefined
  const sysTemplate = snapshot.system_prompt_template as string | undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-bold tracking-tight leading-snug">{name || t('untitledTemplate')}</h3>
          {category && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20 capitalize">
              {category}
            </span>
          )}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Templates */}
      {taskTemplate && (
        <ExpandableContent label={t('taskTemplate')} content={taskTemplate} icon={IconTemplate} maxLines={6} />
      )}
      {sysTemplate && (
        <ExpandableContent label={t('systemTemplate')} content={sysTemplate} icon={IconRobot} maxLines={6} />
      )}
    </div>
  )
}

export function VersionPreview({ contentType, snapshot }: VersionPreviewProps) {
  switch (contentType) {
    case 'lesson':
      return <LessonPreview snapshot={snapshot} />
    case 'exam':
      return <ExamPreview snapshot={snapshot} />
    case 'exercise':
      return <ExercisePreview snapshot={snapshot} />
    case 'prompt_template':
      return <TemplatePreview snapshot={snapshot} />
  }
}
