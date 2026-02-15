'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { updateSettings } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface GeneralSettingsFormProps {
  settings: Record<string, any>
}

export default function GeneralSettingsForm({ settings }: GeneralSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Extract current values
  const siteName = settings.site_name?.value?.value || ''
  const siteDescription = settings.site_description?.value?.value || ''
  const contactEmail = settings.contact_email?.value?.value || ''
  const supportEmail = settings.support_email?.value?.value || ''
  const timezone = settings.timezone?.value?.value || 'America/New_York'
  const maintenanceMode = settings.maintenance_mode?.value?.enabled || false
  const maintenanceMessage = settings.maintenance_mode?.value?.message || ''

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        site_name: { value: formData.get('site_name') as string },
        site_description: { value: formData.get('site_description') as string },
        contact_email: { value: formData.get('contact_email') as string },
        support_email: { value: formData.get('support_email') as string },
        timezone: { value: formData.get('timezone') as string },
        maintenance_mode: {
          enabled: formData.get('maintenance_mode') === 'on',
          message: formData.get('maintenance_message') as string,
        },
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
    <form action={handleSubmit} className="space-y-6">
      {/* Site Name */}
      <div className="space-y-2">
        <Label htmlFor="site_name">{t('general.siteName')}</Label>
        <Input
          id="site_name"
          name="site_name"
          defaultValue={siteName}
          placeholder={t('general.siteNamePlaceholder')}
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('general.siteNameHint')}
        </p>
      </div>

      {/* Site Description */}
      <div className="space-y-2">
        <Label htmlFor="site_description">{t('general.siteDescription')}</Label>
        <Textarea
          id="site_description"
          name="site_description"
          defaultValue={siteDescription}
          placeholder={t('general.siteDescriptionPlaceholder')}
          rows={3}
        />
        <p className="text-sm text-muted-foreground">
          {t('general.siteDescriptionHint')}
        </p>
      </div>

      {/* Contact Email */}
      <div className="space-y-2">
        <Label htmlFor="contact_email">{t('general.contactEmail')}</Label>
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={contactEmail}
          placeholder="contact@example.com"
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('general.contactEmailHint')}
        </p>
      </div>

      {/* Support Email */}
      <div className="space-y-2">
        <Label htmlFor="support_email">{t('general.supportEmail')}</Label>
        <Input
          id="support_email"
          name="support_email"
          type="email"
          defaultValue={supportEmail}
          placeholder="support@example.com"
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('general.supportEmailHint')}
        </p>
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label htmlFor="timezone">{t('general.timezone')}</Label>
        <Input
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          placeholder="America/New_York"
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('general.timezoneHint')}
        </p>
      </div>

      {/* Maintenance Mode */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="maintenance_mode">{t('general.maintenanceMode')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('general.maintenanceModeHint')}
            </p>
          </div>
          <Switch
            id="maintenance_mode"
            name="maintenance_mode"
            defaultChecked={maintenanceMode}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maintenance_message">{t('general.maintenanceMessage')}</Label>
          <Textarea
            id="maintenance_message"
            name="maintenance_message"
            defaultValue={maintenanceMessage}
            placeholder={t('general.maintenanceMessagePlaceholder')}
            rows={3}
          />
        </div>
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
