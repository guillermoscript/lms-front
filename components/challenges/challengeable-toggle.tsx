'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { setExerciseChallengeable } from '@/app/actions/challenge-links'

interface Props {
  exerciseId: number
  initialValue: boolean
}

export function ChallengeableToggle({ exerciseId, initialValue }: Props) {
  const t = useTranslations('challenges.admin.exercise')
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
        toast.error(t('error'))
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
          disabled={saving}
          onCheckedChange={(checked) => void onChange(checked === true)}
        />
      </div>
      <p className="mt-3 text-sm text-warning" role="note">
        {t('warning')}
      </p>
    </div>
  )
}
