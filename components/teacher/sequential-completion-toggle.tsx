'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Switch } from '@/components/ui/switch'
import { toggleSequentialCompletion } from '@/app/actions/teacher/lesson-resources'

interface SequentialCompletionToggleProps {
  courseId: number
  initialValue: boolean
}

export function SequentialCompletionToggle({
  courseId,
  initialValue,
}: SequentialCompletionToggleProps) {
  const t = useTranslations('dashboard.teacher.manageCourse')
  const [enabled, setEnabled] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function handleToggle(checked: boolean) {
    setEnabled(checked)
    setSaving(true)
    const result = await toggleSequentialCompletion(courseId, checked)
    if (!result.success) {
      setEnabled(!checked) // revert
    }
    setSaving(false)
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{t('sequentialCompletion')}</h2>
      <p className="text-sm text-muted-foreground mb-4">
        {t('sequentialCompletionDescription')}
      </p>
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
        />
        <span className="text-sm font-medium">
          {t('sequentialCompletion')}
        </span>
      </div>
    </div>
  )
}
