'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateSettings, type SettingsGroup } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface EnrollmentSettingsFormProps {
  settings: SettingsGroup
  /** Published lessons currently marked as a free preview, across every
   *  course — so the switch below isn't a decision made in the dark (#799). */
  previewLessonCount: number
}

export default function EnrollmentSettingsForm({ settings, previewLessonCount }: EnrollmentSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const freePreviewEnabled = settings.free_preview_enabled?.value?.enabled ?? true

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const formData = new FormData(event.currentTarget)
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        free_preview_enabled: { enabled: formData.get('free_preview_enabled') === 'on' },
      }

      const result = await updateSettings(updatedSettings)

      if (result.success) {
        toast.success(t('success'))
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Free Preview Lessons */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="free_preview_enabled">{t('enrollment.freePreview')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('enrollment.freePreviewHint')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('enrollment.freePreviewCount', { count: previewLessonCount })}
          </p>
        </div>
        <Switch
          id="free_preview_enabled"
          name="free_preview_enabled"
          defaultChecked={freePreviewEnabled}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isSubmitting ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  )
}
