'use client'

import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  IconRobot,
  IconSparkles,
} from '@tabler/icons-react'
import { ImprovedTemplateSelector } from '../improved-template-selector'
import { AIPreviewModal } from '../ai-preview-modal'
import { useLessonEditor } from './lesson-editor-context'

export function LessonAITaskStep() {
  const { formData, updateField, setFormData } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  return (
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
  )
}
