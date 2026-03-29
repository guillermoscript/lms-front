'use client'

import { useTranslations } from 'next-intl'
import { useExerciseBuilder } from './exercise-builder-context'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  IconMicrophone,
  IconClock,
  IconEye,
  IconCheck,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

export function ExerciseAudioConfigStep() {
  const { formData, updateField } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  return (
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
  )
}
