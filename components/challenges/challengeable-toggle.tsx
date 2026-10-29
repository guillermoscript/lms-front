'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { createOpenChallengeLink, setExerciseChallengeable } from '@/app/actions/challenge-links'
import { ChallengeLinkAction } from '@/components/challenges/challenge-link-action'

interface Props {
  exerciseId: number
  initialValue: boolean
  /** The school's `challenges_enabled` switch. */
  challengesEnabled: boolean
  /** Only essay/discussion exercises can be played by guests. */
  supportedType: boolean
}

export function ChallengeableToggle({ exerciseId, initialValue, challengesEnabled, supportedType }: Props) {
  const t = useTranslations('challenges.admin.exercise')
  const tShare = useTranslations('challenges.share')
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function onChange(next: boolean) {
    setSaving(true)
    try {
      const res = await setExerciseChallengeable(exerciseId, next)
      if (res.success) {
        setValue(res.data.isChallengeable)
        toast.success(t('saved'))
      } else {
        toast.error(res.error.startsWith('Only') || res.error.includes('not enabled') ? res.error : t('error'))
      }
    } catch {
      toast.error(t('error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mb-6 rounded-lg border p-4" data-testid="challengeable-toggle">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="is_challengeable">{t('label')}</Label>
          <p className="text-sm text-muted-foreground">{t('hint')}</p>
        </div>
        <Switch
          id="is_challengeable"
          checked={value}
          disabled={saving || (!supportedType && !value)}
          onCheckedChange={(checked) => void onChange(checked === true)}
        />
      </div>
      <p className="mt-3 text-sm text-warning" role="note">
        {t('warning')}
      </p>
      {value && challengesEnabled && supportedType && (
        <div className="mt-3 space-y-1">
          <ChallengeLinkAction
            create={() => createOpenChallengeLink(exerciseId)}
            label={tShare('copyLink')}
            variant="outline"
            testId="challenge-copy-open-link"
          />
          <p className="text-xs text-muted-foreground">{tShare('editorHint')}</p>
        </div>
      )}
      {!supportedType && (
        <p className="mt-2 text-sm text-muted-foreground">{t('unsupportedType')}</p>
      )}
      {!challengesEnabled && (
        <p className="mt-2 text-sm text-muted-foreground">{t('disabledHint')}</p>
      )}
    </div>
  )
}
