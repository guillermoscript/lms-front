'use client'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { IconChevronDown, IconVideo, IconRobot, IconFileText, IconClipboardList, IconTemplate, IconClock } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

interface VersionPreviewProps {
  contentType: 'lesson' | 'exam' | 'exercise' | 'prompt_template'
  snapshot: Record<string, unknown>
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null
  const colors: Record<string, string> = {
    published: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
    draft: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  }
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border capitalize',
      colors[status] || 'bg-muted text-muted-foreground border-border'
    )}>
      {status}
    </span>
  )
}

function SectionBlock({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-muted-foreground/70" />}
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}

function ExpandableContent({ label, content, icon, maxLines = 8 }: {
  label: string
  content: string
  icon?: React.ComponentType<{ className?: string }>
  maxLines?: number
}) {
  return (
    <SectionBlock icon={icon} label={label}>
      <Collapsible>
        <CollapsibleTrigger className="group w-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg outline-none">
          <div
            className="relative rounded-lg border bg-[#1e1e2e] p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap text-[#cdd6f4] overflow-hidden transition-colors group-hover:border-primary/30"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: maxLines,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}
          >
            {content}
          </div>
          <span className="flex items-center gap-1.5 mt-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <IconChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            <span className="group-data-[state=open]:hidden">Show all</span>
            <span className="hidden group-data-[state=open]:inline">Collapse</span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="rounded-lg border bg-[#1e1e2e] p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap text-[#cdd6f4] mt-2">
            {content}
          </div>
        </CollapsibleContent>
      </Collapsible>
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
  const title = snapshot.title as string | undefined
  const description = snapshot.description as string | undefined
  const content = snapshot.content as string | undefined
  const videoUrl = snapshot.video_url as string | undefined
  const status = snapshot.status as string | undefined
  const aiTaskDescription = snapshot.ai_task_description as string | undefined
  const aiTaskInstructions = snapshot.ai_task_instructions as string | undefined
  const aiTask = snapshot.ai_task as Record<string, unknown> | null | undefined

  const taskPrompt = aiTaskDescription || (aiTask as Record<string, unknown> | null)?.task_instructions as string | undefined
  const systemPrompt = aiTaskInstructions || (aiTask as Record<string, unknown> | null)?.system_prompt as string | undefined

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || 'Untitled Lesson'}</h3>
          <StatusBadge status={status} />
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Video */}
      {videoUrl && (
        <SectionBlock icon={IconVideo} label="Video">
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/40 border font-mono text-sm truncate">
            {videoUrl}
          </div>
        </SectionBlock>
      )}

      {/* Content */}
      {content && (
        <ExpandableContent label="Content" content={content} icon={IconFileText} />
      )}

      {/* AI Task */}
      {(taskPrompt || systemPrompt) && (
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <IconRobot className="h-4 w-4 text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70">
              AI Task Configuration
            </span>
          </div>
          {taskPrompt && (
            <ExpandableContent label="Task Prompt" content={taskPrompt} maxLines={4} />
          )}
          {systemPrompt && (
            <ExpandableContent label="System Prompt" content={systemPrompt} maxLines={4} />
          )}
        </div>
      )}
    </div>
  )
}

function ExamPreview({ snapshot }: { snapshot: Record<string, unknown> }) {
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
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || 'Untitled Exam'}</h3>
          <StatusBadge status={status} />
        </div>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-2">
        {duration !== undefined && <MetaPill label="Duration" value={`${duration}m`} />}
        <MetaPill label="Questions" value={questions.length} />
      </div>

      {/* Questions */}
      {questions.length > 0 && (
        <SectionBlock icon={IconClipboardList} label="Questions">
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded outline-none py-1">
              <IconChevronDown aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              <span>Show {questions.length} questions</span>
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
          <h3 className="text-xl font-bold tracking-tight leading-snug">{title || 'Untitled Exercise'}</h3>
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
        {timeLimit !== undefined && <MetaPill label="Time limit" value={`${timeLimit}m`} />}
      </div>

      {/* Instructions */}
      {instructions && (
        <ExpandableContent label="Instructions" content={instructions} icon={IconFileText} maxLines={6} />
      )}
    </div>
  )
}

function TemplatePreview({ snapshot }: { snapshot: Record<string, unknown> }) {
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
          <h3 className="text-xl font-bold tracking-tight leading-snug">{name || 'Untitled Template'}</h3>
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
        <ExpandableContent label="Task Template" content={taskTemplate} icon={IconTemplate} maxLines={6} />
      )}
      {sysTemplate && (
        <ExpandableContent label="System Prompt Template" content={sysTemplate} icon={IconRobot} maxLines={6} />
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
