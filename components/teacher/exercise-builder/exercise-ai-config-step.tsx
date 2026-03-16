'use client'

import { useTranslations } from 'next-intl'
import { useExerciseBuilder } from './exercise-builder-context'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ImprovedTemplateSelector } from '../improved-template-selector'
import { AIPreviewModal } from '../ai-preview-modal'
import {
  IconRobot,
  IconEye,
} from '@tabler/icons-react'

export function ExerciseAIConfigStep() {
  const { formData, updateField, setFormData } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  return (
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
  )
}
