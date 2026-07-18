'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconRoute } from '@tabler/icons-react'
import { Switch } from '@/components/ui/switch'
import { setUiState } from '@/app/actions/ui-state'
import { TOURS_ENABLED_KEY } from '@/lib/ui-state-keys'

interface ToursToggleProps {
  /** Server-persisted tours_enabled value, read in the page */
  initialEnabled: boolean
}

// "Show tips & tours" — the user-facing replacement for the hidden
// `tours-disabled` localStorage kill-switch (issue #452). The localStorage key
// is still mirrored as an optimistic cache so GuidedTour reacts before the
// server write lands (and E2E can keep setting it directly).
export function ToursToggle({ initialEnabled }: ToursToggleProps) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [isSaving, setIsSaving] = useState(false)
  const t = useTranslations('components.toursToggle')

  const handleChange = async (checked: boolean) => {
    setIsSaving(true)
    setEnabled(checked)
    if (checked) {
      localStorage.removeItem('tours-disabled')
    } else {
      localStorage.setItem('tours-disabled', 'true')
    }

    const result = await setUiState(TOURS_ENABLED_KEY, checked)
    if (result.success) {
      toast.success(checked ? t('enabledToast') : t('disabledToast'))
    } else {
      setEnabled(!checked)
      if (!checked) {
        localStorage.removeItem('tours-disabled')
      } else {
        localStorage.setItem('tours-disabled', 'true')
      }
      toast.error(t('error'))
    }
    setIsSaving(false)
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="p-1.5 rounded-lg bg-muted/50 shrink-0">
          <IconRoute size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('label')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('description')}</p>
        </div>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={isSaving}
        aria-label={t('label')}
      />
    </div>
  )
}
