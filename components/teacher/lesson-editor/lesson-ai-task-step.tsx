'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import {
  IconRobot,
  IconCheck,
  IconPencil,
  IconCircleDashed,
  IconAlertTriangle,
  IconEyeOff,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ImprovedTemplateSelector } from '../improved-template-selector'
import { AIPreviewModal } from '../ai-preview-modal'
import { useLessonEditor } from './lesson-editor-context'
import { MarkdownField } from './markdown-field'

type TaskState = 'none' | 'unsaved' | 'saved'

const STATE_STYLES: Record<TaskState, string> = {
  none: 'text-muted-foreground',
  unsaved: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  saved: 'bg-muted text-foreground',
}

export function LessonAITaskStep() {
  const { formData, savedTask, updateField, setFormData } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  const prompt = formData.ai_task_description.trim()
  const grading = formData.ai_task_instructions.trim()

  const hasDraft = Boolean(prompt || grading)
  const hasSaved = Boolean(savedTask.description || savedTask.instructions)
  const isDirty =
    prompt !== savedTask.description || grading !== savedTask.instructions

  // A task that was saved and is now emptied is not "no task" until the lesson
  // is saved again, and the teacher should know what saving will do.
  const willRemove = hasSaved && !hasDraft

  const state: TaskState = !hasDraft && !hasSaved ? 'none' : isDirty ? 'unsaved' : 'saved'
  const StateIcon =
    state === 'saved' ? IconCheck : state === 'unsaved' ? IconPencil : IconCircleDashed

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10">
            <IconRobot aria-hidden="true" className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="max-w-prose">
            <h2 className="text-lg font-semibold tracking-tight">{t('aiTaskTitle')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('aiTaskDescription')} {t('aiTaskOptionalHint')}
            </p>
          </div>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
            state === 'none' && 'border-dashed',
            STATE_STYLES[state]
          )}
        >
          <StateIcon aria-hidden="true" className="h-3.5 w-3.5" />
          {t(
            state === 'saved'
              ? 'aiTaskStateSaved'
              : state === 'unsaved'
                ? 'aiTaskStateUnsaved'
                : 'aiTaskStateNone'
          )}
        </span>
      </div>

      {willRemove && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {t('aiTaskRemoveWarning')}
        </p>
      )}

      <div className="space-y-8">
        <MarkdownField
          id="ai_task_description"
          label={t('aiTaskPromptLabel')}
          hint={t('aiTaskPromptHint')}
          value={formData.ai_task_description}
          onChange={(value) => updateField('ai_task_description', value)}
          placeholder={t('aiTaskPromptPlaceholder')}
          actions={
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
          }
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="ai_task_instructions" className="text-sm font-medium">
                {t('aiGradingInsLabelShort')}
              </Label>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                <IconEyeOff aria-hidden="true" className="h-3 w-3" />
                {t('aiHiddenBadge')}
              </span>
            </div>
            <AIPreviewModal
              type="lesson"
              config={{
                task_description: formData.ai_task_description,
                system_prompt: formData.ai_task_instructions,
              }}
            />
          </div>

          <textarea
            id="ai_task_instructions"
            value={formData.ai_task_instructions}
            onChange={(event) => updateField('ai_task_instructions', event.target.value)}
            placeholder={t('aiGradingInsPlaceholder')}
            className="field-sizing-content block max-h-96 min-h-36 w-full resize-y overflow-y-auto rounded-lg border bg-input/20 px-3 py-2.5 font-mono text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
          />

          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('aiGradingInsHint')}
            </p>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {t('charCount', { count: formData.ai_task_instructions.length })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
