'use client'

import { useTranslations } from 'next-intl'
import { useExerciseBuilder } from './exercise-builder-context'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IconMessageCircle, IconClock } from '@tabler/icons-react'
import {
  CONVERSATION_LANGUAGES,
  CONVERSATION_LEVELS,
  CONVERSATION_VOICES,
  MAX_CONVERSATION_MINUTES,
} from '@/lib/speech/conversation'

export function ExerciseConversationConfigStep() {
  const { formData, updateField } = useExerciseBuilder()
  const t = useTranslations('dashboard.teacher.exerciseBuilder')

  const languageSelect = (
    field: 'conv_target_language' | 'conv_native_language',
    label: string
  ) => (
    <div className="rounded-xl border bg-card p-4">
      <Label className="mb-2 block text-xs font-medium text-muted-foreground">{label}</Label>
      <Select value={formData[field]} onValueChange={(v) => v && updateField(field, v)}>
        <SelectTrigger className="h-10 w-full border-muted bg-muted/30">
          {/* base-ui shows the raw value ("en") unless told how to label it. */}
          <SelectValue>{(code: string) => t(`conversationLanguages.${code}`)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CONVERSATION_LANGUAGES.map((code) => (
            <SelectItem key={code} value={code}>
              {t(`conversationLanguages.${code}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="animate-in fade-in slide-in-from-left-2 duration-300 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint">
          <IconMessageCircle className="h-5 w-5 text-brand-text" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t('conversationSetupTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('conversationSetupDesc')}</p>
        </div>
      </div>

      {/* Scenario */}
      <div>
        <Label htmlFor="conv_scenario" className="mb-2 block text-sm font-medium">
          {t('conversationScenarioLabel')}
        </Label>
        <Textarea
          id="conv_scenario"
          value={formData.conv_scenario}
          onChange={(e) => updateField('conv_scenario', e.target.value)}
          placeholder={t('conversationScenarioPlaceholder')}
          rows={4}
          className="border-muted bg-muted/30 transition-colors focus:bg-background"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">{t('conversationScenarioHint')}</p>
      </div>

      <Separator className="my-2" />

      {/* Languages & level */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('conversationLanguageSection')}</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {languageSelect('conv_target_language', t('conversationTargetLanguage'))}
          {languageSelect('conv_native_language', t('conversationNativeLanguage'))}
          <div className="rounded-xl border bg-card p-4">
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              {t('conversationLevel')}
            </Label>
            <Select value={formData.conv_level} onValueChange={(v) => v && updateField('conv_level', v)}>
              <SelectTrigger className="h-10 w-full border-muted bg-muted/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_LEVELS.map((level) => (
                  <SelectItem key={level} value={level}>
                    {level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t('conversationNativeHint')}</p>
      </div>

      <Separator className="my-2" />

      {/* Voice, length, limits */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">{t('studentLimits')}</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <Label className="mb-2 block text-xs font-medium text-muted-foreground">
              {t('conversationVoice')}
            </Label>
            <Select value={formData.conv_voice} onValueChange={(v) => v && updateField('conv_voice', v)}>
              <SelectTrigger className="h-10 w-full border-muted bg-muted/30 capitalize">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONVERSATION_VOICES.map((voice) => (
                  <SelectItem key={voice} value={voice} className="capitalize">
                    {voice}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Label htmlFor="conv_max_minutes" className="mb-2 block text-xs font-medium text-muted-foreground">
              <IconClock className="mr-1 inline h-3 w-3" />
              {t('conversationMaxMinutes')}
            </Label>
            <Input
              id="conv_max_minutes"
              type="number"
              min={1}
              max={MAX_CONVERSATION_MINUTES}
              value={formData.conv_max_minutes}
              onChange={(e) =>
                updateField(
                  'conv_max_minutes',
                  Math.min(MAX_CONVERSATION_MINUTES, Math.max(1, parseInt(e.target.value) || 1))
                )
              }
              className="h-10 border-muted bg-muted/30 text-center"
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Label htmlFor="conv_passing_score" className="mb-2 block text-xs font-medium text-muted-foreground">
              {t('passingScoreLabel')}
            </Label>
            <Input
              id="conv_passing_score"
              type="number"
              min={0}
              max={100}
              value={formData.passing_score}
              onChange={(e) =>
                updateField('passing_score', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="h-10 border-muted bg-muted/30 text-center"
            />
          </div>
          <div className="rounded-xl border bg-card p-4">
            <Label htmlFor="conv_daily" className="mb-2 block text-xs font-medium text-muted-foreground">
              {t('conversationDailySessions')}
            </Label>
            <Input
              id="conv_daily"
              type="number"
              min={0}
              max={50}
              value={formData.max_daily_attempts}
              onChange={(e) =>
                updateField('max_daily_attempts', Math.min(50, Math.max(0, parseInt(e.target.value) || 0)))
              }
              className="h-10 border-muted bg-muted/30 text-center"
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">{t('conversationCostHint')}</p>
      </div>
    </div>
  )
}
