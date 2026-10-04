'use client'

import { useTranslations } from 'next-intl'
import { nanoid } from 'nanoid'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  IconRobot,
  IconCheck,
  IconPencil,
  IconCircleDashed,
  IconAlertTriangle,
  IconEyeOff,
  IconPlus,
  IconTrash,
  IconArrowUp,
  IconArrowDown,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ImprovedTemplateSelector } from '../improved-template-selector'
import { AIPreviewModal } from '../ai-preview-modal'
import { useLessonEditor } from './lesson-editor-context'
import { MarkdownField } from './markdown-field'
import {
  DEFAULT_MIN_STUDENT_TURNS,
  newRequirement,
  type StructuredRequirements,
} from '@/lib/ai/lesson-requirements'

type TaskState = 'none' | 'unsaved' | 'saved'

const STATE_STYLES: Record<TaskState, string> = {
  none: 'text-muted-foreground',
  unsaved: 'bg-warning/10 text-warning border-warning/20',
  saved: 'bg-muted text-foreground',
}

const emptyStructured = (): StructuredRequirements => ({
  level: '',
  scenario: '',
  tutor_role: '',
  requirements: [newRequirement(nanoid(6))],
  min_student_turns: DEFAULT_MIN_STUDENT_TURNS,
})

export function LessonAITaskStep() {
  const { formData, savedTask, updateField, setFormData } = useLessonEditor()
  const t = useTranslations('dashboard.teacher.lessonEditor')

  const structured = formData.ai_task_requirements
  // The mode is a direct read of `ai_task_requirements`, not separate UI
  // state: the compatibility contract is `requirements IS NULL` ⇒ free text,
  // so there is nothing for the form to track beyond that field itself.
  const mode: 'structured' | 'freeform' = structured ? 'structured' : 'freeform'

  const prompt = formData.ai_task_description.trim()
  const grading = formData.ai_task_instructions.trim()

  const hasDraft = mode === 'structured' ? Boolean(structured) : Boolean(prompt || grading)
  const hasSaved = mode === 'structured' ? Boolean(savedTask.requirements) : Boolean(savedTask.description || savedTask.instructions)
  const isDirty =
    mode === 'structured'
      ? JSON.stringify(structured) !== JSON.stringify(savedTask.requirements)
      : prompt !== savedTask.description || grading !== savedTask.instructions

  // A task that was saved and is now emptied is not "no task" until the lesson
  // is saved again, and the teacher should know what saving will do.
  const willRemove = hasSaved && !hasDraft

  const state: TaskState = !hasDraft && !hasSaved ? 'none' : isDirty ? 'unsaved' : 'saved'
  const StateIcon =
    state === 'saved' ? IconCheck : state === 'unsaved' ? IconPencil : IconCircleDashed

  const setStructured = (next: StructuredRequirements) => updateField('ai_task_requirements', next)

  const updateRequirement = (id: string, text: string) => {
    if (!structured) return
    setStructured({
      ...structured,
      requirements: structured.requirements.map((r) => (r.id === id ? { ...r, text } : r)),
    })
  }

  const addRequirement = () => {
    if (!structured) return
    setStructured({ ...structured, requirements: [...structured.requirements, newRequirement(nanoid(6))] })
  }

  const removeRequirement = (id: string) => {
    if (!structured || structured.requirements.length <= 1) return
    setStructured({ ...structured, requirements: structured.requirements.filter((r) => r.id !== id) })
  }

  const moveRequirement = (index: number, direction: -1 | 1) => {
    if (!structured) return
    const target = index + direction
    if (target < 0 || target >= structured.requirements.length) return
    const next = [...structured.requirements]
    ;[next[index], next[target]] = [next[target], next[index]]
    setStructured({ ...structured, requirements: next })
  }

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
            <IconRobot aria-hidden="true" className="h-5 w-5 text-brand-text" />
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
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-warning">
          <IconAlertTriangle aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
          {t('aiTaskRemoveWarning')}
        </p>
      )}

      {/* Free text vs. structured fields (#806) — mutually exclusive, since a
          structured config takes over the whole tutor prompt. */}
      <div className="mb-6 inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
        {(['freeform', 'structured'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => updateField('ai_task_requirements', option === 'structured' ? (structured ?? emptyStructured()) : null)}
            aria-pressed={mode === option}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
              mode === option ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t(option === 'freeform' ? 'aiTaskModeFreeText' : 'aiTaskModeStructured')}
          </button>
        ))}
      </div>

      {mode === 'freeform' ? (
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
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                  <IconEyeOff aria-hidden="true" className="h-3 w-3" />
                  {t('aiHiddenBadge')}
                </span>
              </div>
              <AIPreviewModal
                type="lesson"
                config={{
                  task_description: formData.ai_task_description,
                  system_prompt: formData.ai_task_instructions,
                  lesson: {
                    title: formData.title,
                    description: formData.description,
                    content: formData.content,
                  },
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
      ) : structured ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-relaxed text-muted-foreground max-w-prose">
              {t('aiTaskStructuredHint')}
            </p>
            <div className="flex items-center gap-2">
              <ImprovedTemplateSelector
                category="lesson_task"
                onApply={(data) => {
                  // Only the three lesson_task system templates have a known
                  // structured mapping (see `mapSystemTemplateToStructured`);
                  // a teacher's own template leaves the fields as they are.
                  if (data.structured) setStructured(data.structured)
                }}
              />
              <AIPreviewModal
                type="lesson"
                config={{
                  requirements: structured,
                  lesson: {
                    title: formData.title,
                    description: formData.description,
                    content: formData.content,
                  },
                }}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai_task_level" className="text-sm font-medium">{t('aiTaskLevelLabel')}</Label>
              <Input
                id="ai_task_level"
                value={structured.level}
                onChange={(e) => setStructured({ ...structured, level: e.target.value })}
                placeholder={t('aiTaskLevelPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai_task_tutor_role" className="text-sm font-medium">{t('aiTaskTutorRoleLabel')}</Label>
              <Input
                id="ai_task_tutor_role"
                value={structured.tutor_role}
                onChange={(e) => setStructured({ ...structured, tutor_role: e.target.value })}
                placeholder={t('aiTaskTutorRolePlaceholder')}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai_task_scenario" className="text-sm font-medium">{t('aiTaskScenarioLabel')}</Label>
            <textarea
              id="ai_task_scenario"
              value={structured.scenario}
              onChange={(e) => setStructured({ ...structured, scenario: e.target.value })}
              placeholder={t('aiTaskScenarioPlaceholder')}
              className="field-sizing-content block max-h-60 min-h-20 w-full resize-y overflow-y-auto rounded-lg border bg-input/20 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-medium">{t('aiTaskRequirementsLabel')}</Label>
              <p className="text-xs text-muted-foreground">{t('aiTaskRequirementsHint')}</p>
            </div>
            <ol className="space-y-2">
              {structured.requirements.map((requirement, index) => (
                <li key={requirement.id} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Input
                    value={requirement.text}
                    onChange={(e) => updateRequirement(requirement.id, e.target.value)}
                    placeholder={t('aiTaskRequirementPlaceholder')}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={index === 0}
                    onClick={() => moveRequirement(index, -1)}
                    aria-label={t('aiTaskMoveUp')}
                  >
                    <IconArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={index === structured.requirements.length - 1}
                    onClick={() => moveRequirement(index, 1)}
                    aria-label={t('aiTaskMoveDown')}
                  >
                    <IconArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    disabled={structured.requirements.length <= 1}
                    onClick={() => removeRequirement(requirement.id)}
                    aria-label={t('aiTaskRemoveRequirement')}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ol>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addRequirement}>
              <IconPlus className="h-3.5 w-3.5" />
              {t('aiTaskAddRequirement')}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai_task_closing_phase" className="text-sm font-medium">
              {t('aiTaskClosingPhaseLabel')}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('aiTaskOptionalHint')}</span>
            </Label>
            <textarea
              id="ai_task_closing_phase"
              value={structured.closing_phase ?? ''}
              onChange={(e) => setStructured({ ...structured, closing_phase: e.target.value || undefined })}
              placeholder={t('aiTaskClosingPhasePlaceholder')}
              className="field-sizing-content block max-h-40 min-h-16 w-full resize-y overflow-y-auto rounded-lg border bg-input/20 px-3 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{t('aiTaskClosingPhaseHint')}</p>
          </div>

          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="ai_task_min_turns" className="text-sm font-medium">{t('aiTaskMinTurnsLabel')}</Label>
            <Input
              id="ai_task_min_turns"
              type="number"
              min={0}
              value={structured.min_student_turns}
              onChange={(e) =>
                setStructured({ ...structured, min_student_turns: Math.max(0, Number(e.target.value) || 0) })
              }
            />
            <p className="text-xs leading-relaxed text-muted-foreground">{t('aiTaskMinTurnsHint')}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
