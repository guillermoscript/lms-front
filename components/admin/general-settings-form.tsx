'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { updateSettings, updateSchoolCountry, type SettingsGroup } from '@/app/actions/admin/settings'
import { CountryPicker } from '@/components/shared/country-picker'
import type { CountryCode } from '@/lib/countries'
import { toast } from 'sonner'
import { IconLoader2 } from '@tabler/icons-react'
import { useTranslations } from 'next-intl'

interface GeneralSettingsFormProps {
  settings: SettingsGroup
  /** `tenants.country` (#865); null until the school picks one. */
  country: CountryCode | null
}

export default function GeneralSettingsForm({ settings, country: savedCountry }: GeneralSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [country, setCountry] = useState<CountryCode | null>(savedCountry)
  // What the server holds now — so a second save doesn't re-send an unchanged country.
  const [persistedCountry, setPersistedCountry] = useState<CountryCode | null>(savedCountry)

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
      if (!result.success) {
        throw new Error(result.error)
      }

      // The country is a tenants column, saved by its own action. Clearing it
      // is not offered: once chosen, a school only ever switches country.
      if (country && country !== persistedCountry) {
        const countryResult = await updateSchoolCountry(country)
        if (!countryResult.success) {
          throw new Error(t('general.countryError'))
        }
        setPersistedCountry(country)
        if (countryResult.currencyFilled) {
          toast.success(t('success'), {
            description: t('general.countryCurrencyFilled', { currency: countryResult.currencyFilled }),
          })
          return
        }
      }

      toast.success(t('success'))
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

      {/* Country (#865) */}
      <div className="space-y-2">
        <Label htmlFor="school_country">{t('general.country')}</Label>
        <CountryPicker
          id="school_country"
          data-testid="settings-country"
          aria-describedby="school_country_hint"
          value={country}
          onValueChange={setCountry}
          placeholder={t('general.countryPlaceholder')}
          emptyText={t('general.countryEmpty')}
          disabled={isSubmitting}
        />
        <p id="school_country_hint" className="text-sm text-muted-foreground">
          {t('general.countryHint')}
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
          {isSubmitting && <IconLoader2 className="mr-2 h-4 w-4 motion-safe:animate-spin" />}
          {isSubmitting ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  )
}
