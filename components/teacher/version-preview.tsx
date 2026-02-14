'use client'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { IconChevronDown } from '@tabler/icons-react'

interface VersionPreviewProps {
  contentType: 'lesson' | 'exam' | 'exercise' | 'prompt_template'
  snapshot: Record<string, unknown>
}

function StatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null
  const variant = status === 'published' ? 'default' : status === 'draft' ? 'secondary' : 'outline'
  return <Badge variant={variant}>{status}</Badge>
}

function ExpandableContent({ label, content, maxLines = 6 }: { label?: string; content: string; maxLines?: number }) {
  const lineClamp = `line-clamp-${maxLines}` as string
  return (
    <Collapsible>
      {label ? (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1.5">{label}</p>
      ) : null}
      <CollapsibleTrigger className="group w-full text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md outline-none">
        <div className={`relative rounded-lg border bg-muted/30 p-3 text-xs font-mono leading-relaxed whitespace-pre-wrap ${lineClamp} group-data-[state=open]:line-clamp-none transition-colors group-hover:bg-muted/50`}>
          {content}
        </div>
        <span className="flex items-center gap-1.5 mt-2 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          <IconChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          <span className="group-data-[state=open]:hidden">Show More</span>
          <span className="hidden group-data-[state=open]:inline">Show Less</span>
        </span>
      </CollapsibleTrigger>
    </Collapsible>
  )
}

function LessonPreview({ snapshot }: { snapshot: Record<string, unknown> }) {
  const title = snapshot.title as string | undefined
  const description = snapshot.description as string | undefined
  const content = snapshot.content as string | undefined
  const videoUrl = snapshot.video_url as string | undefined
  const status = snapshot.status as string | undefined
  const aiTask = snapshot.ai_task as Record<string, unknown> | null | undefined
  const aiTaskDescription = snapshot.ai_task_description as string | undefined
  const aiTaskInstructions = snapshot.ai_task_instructions as string | undefined
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-semibold text-base tracking-tight min-w-0 break-words">{title || "Untitled Lesson"}</h4>
        <StatusBadge status={status} />
      </div>
      {description ? (
        <p className="text-muted-foreground leading-relaxed break-words">{description}</p>
      ) : null}
      {content ? (
        <ExpandableContent label="Content" content={content} />
      ) : null}
      {videoUrl ? (
        <div className="flex items-center gap-2 p-2 rounded-md bg-secondary/50 border border-border/50">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Video</span>
          <p className="text-xs font-mono truncate">{videoUrl}</p>
        </div>
      ) : null}
      {(aiTask || aiTaskDescription || aiTaskInstructions) ? (
        <div className="space-y-3 border-t pt-4">
          <h5 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80">AI Task Configuration</h5>
          {aiTaskDescription ? (
            <ExpandableContent label="Task Prompt" content={aiTaskDescription} maxLines={3} />
          ) : (aiTask as Record<string, unknown> | null)?.task_instructions ? (
            <ExpandableContent label="Task Prompt" content={(aiTask as Record<string, unknown>).task_instructions as string} maxLines={3} />
          ) : null}
          {aiTaskInstructions ? (
            <ExpandableContent label="Grading Instructions" content={aiTaskInstructions} maxLines={3} />
          ) : (aiTask as Record<string, unknown> | null)?.system_prompt ? (
            <ExpandableContent label="System Prompt" content={(aiTask as Record<string, unknown>).system_prompt as string} maxLines={3} />
          ) : null}
        </div>
      ) : null}
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
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-semibold text-base tracking-tight min-w-0 break-words">{title || "Untitled Exam"}</h4>
        <StatusBadge status={status} />
      </div>
      {description ? (
        <p className="text-muted-foreground leading-relaxed break-words">{description}</p>
      ) : null}
      <div className="flex gap-4 text-xs font-medium">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-variant-numeric: tabular-nums">
          <span>Duration:</span>
          <span>{duration}m</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary text-secondary-foreground font-variant-numeric: tabular-nums">
          <span>Questions:</span>
          <span>{questions.length}</span>
        </div>
      </div>
      {questions.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="group flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded outline-none">
            <IconChevronDown aria-hidden="true" className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            <span>Show Questions</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {questions.map((q, i) => (
              <div key={i} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-primary/10 text-[10px] font-bold text-primary shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug break-words">{q.question_text as string}</p>
                    <Badge variant="outline" className="text-[10px] h-4 font-bold uppercase tracking-tighter">
                      {q.question_type as string}
                    </Badge>
                  </div>
                </div>
                {(q.options as Array<Record<string, unknown>> | undefined)?.length ? (
                  <div className="ml-7 grid grid-cols-1 gap-1">
                    {(q.options as Array<Record<string, unknown>>).map((o, j) => (
                      <div key={j} className={`flex items-center gap-2 text-xs py-1 px-2 rounded ${o.is_correct ? 'bg-green-500/10 text-green-700 dark:text-green-400 font-medium' : 'text-muted-foreground'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${o.is_correct ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                        {o.option_text as string}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
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
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-semibold text-base tracking-tight min-w-0 break-words">{title || "Untitled Exercise"}</h4>
        <div className="flex gap-1.5">
          <StatusBadge status={status} />
          {exerciseType && <Badge variant="outline" className="capitalize">{exerciseType}</Badge>}
        </div>
      </div>
      {description ? (
        <p className="text-muted-foreground leading-relaxed break-words">{description}</p>
      ) : null}
      <div className="flex items-center gap-3">
        {difficultyLevel && (
          <Badge variant="secondary" className="capitalize text-[10px] h-5 font-bold">
            {difficultyLevel}
          </Badge>
        )}
        {timeLimit ? (
          <span className="text-xs text-muted-foreground font-variant-numeric: tabular-nums">
            Time limit: {timeLimit}m
          </span>
        ) : null}
      </div>
      {instructions ? (
        <ExpandableContent label="Instructions" content={instructions} maxLines={4} />
      ) : null}
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
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-semibold text-base tracking-tight min-w-0 break-words">{name || "Untitled Template"}</h4>
        {category ? <Badge variant="outline" className="capitalize">{category}</Badge> : null}
      </div>
      {description ? (
        <p className="text-muted-foreground leading-relaxed break-words">{description}</p>
      ) : null}
      {taskTemplate ? (
        <ExpandableContent label="Task Template" content={taskTemplate} maxLines={4} />
      ) : null}
      {sysTemplate ? (
        <ExpandableContent label="System Prompt Template" content={sysTemplate} maxLines={4} />
      ) : null}
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
