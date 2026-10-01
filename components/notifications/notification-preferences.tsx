'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { IconAdjustmentsHorizontal } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  setCommunityNotificationPreference,
  type CommunityPreferenceKey,
} from '@/app/actions/notification-preferences'

export interface CommunityPreferences {
  replies: boolean
  prompts: boolean
  mentions: boolean
}

/**
 * "Preferences" on the notifications page (#870) — the first notification
 * settings on the web. Only the community group for now; the sheet is where
 * the rest of `notification_preferences` would go.
 *
 * Each switch saves on its own, optimistically, and reverts with a toast if
 * the write fails (same pattern as ToursToggle).
 */
export function NotificationPreferences({ initial }: { initial: CommunityPreferences }) {
  const t = useTranslations('community.notifications.preferences')
  const tPage = useTranslations('dashboard.student.notifications')

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" size="sm" data-testid="notification-preferences-open">
            <IconAdjustmentsHorizontal aria-hidden />
            {tPage('actions.preferences')}
          </Button>
        }
      />
      <SheetContent side="right" className="w-full sm:max-w-md" data-testid="notification-preferences">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>

        <section className="space-y-1 px-6" aria-labelledby="notification-preferences-community">
          <h3 id="notification-preferences-community" className="pb-1 text-sm font-medium">
            {t('group')}
          </h3>
          <div className="divide-y divide-border rounded-lg border">
            <PreferenceRow
              preference="replies"
              label={t('replies')}
              description={t('repliesDescription')}
              initial={initial.replies}
              errorMessage={t('error')}
            />
            <PreferenceRow
              preference="mentions"
              label={t('mentions')}
              description={t('mentionsDescription')}
              initial={initial.mentions}
              errorMessage={t('error')}
            />
            <PreferenceRow
              preference="prompts"
              label={t('prompts')}
              description={t('promptsDescription')}
              initial={initial.prompts}
              errorMessage={t('error')}
            />
          </div>
          <p className="pt-2 text-muted-foreground">{t('everySchool')}</p>
        </section>
      </SheetContent>
    </Sheet>
  )
}

function PreferenceRow({
  preference,
  label,
  description,
  initial,
  errorMessage,
}: {
  preference: CommunityPreferenceKey
  label: string
  description: string
  initial: boolean
  errorMessage: string
}) {
  const id = useId()
  const [enabled, setEnabled] = useState(initial)
  const [saving, setSaving] = useState(false)

  const handleChange = async (checked: boolean) => {
    setEnabled(checked)
    setSaving(true)
    try {
      const result = await setCommunityNotificationPreference(preference, checked)
      if (!result.success) {
        setEnabled(!checked)
        toast.error(errorMessage)
      }
    } catch {
      setEnabled(!checked)
      toast.error(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 px-3 py-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-description`} className="mt-0.5 text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={handleChange}
        disabled={saving}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-description`}
        data-testid={`notification-preference-${preference}`}
        className="mt-0.5"
      />
    </div>
  )
}
