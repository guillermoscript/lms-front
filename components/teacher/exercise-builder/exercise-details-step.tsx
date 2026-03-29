'use client'

import { useTranslations } from 'next-intl'
import { useExerciseBuilder } from './exercise-builder-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  IconSettings2,
  IconChevronRight,
  IconFlame,
  IconClock,
} from '@tabler/icons-react'
import { cn } from '@/lib/utils'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  medium: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  hard: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
}

export function ExerciseDetailsStep() {
  const { formData, updateField, setActiveStep } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300 ">
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
          rows={7}
          className="border-muted bg-muted/30 transition-colors focus:bg-background"
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
                <SelectItem value="audio_evaluation">
                  <span className="flex items-center gap-2">
                    <span>🎙️</span> {t('typeAudio')}
                  </span>
                </SelectItem>
                <SelectItem value="video_evaluation">
                  <span className="flex items-center gap-2">
                    <span>🎥</span> {t('typeVideo')}
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
              <span className="text-xs text-muted-foreground">{t('timeLimitUnit')}</span>
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
                <SelectItem value="draft">{t('statusDraft')}</SelectItem>
                <SelectItem value="published">{t('statusPublished')}</SelectItem>
                <SelectItem value="archived">{t('statusArchived')}</SelectItem>
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
  )
}
