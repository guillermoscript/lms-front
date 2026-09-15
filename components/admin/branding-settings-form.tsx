'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { updateSettings } from '@/app/actions/admin/settings'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface BrandingSettingsFormProps {
  /** `getAllSettingsByCategory().data.general`: rows keyed by setting_key. */
  settings: Record<string, unknown>
}

function settingValue(settings: Record<string, unknown>, key: string): string {
  const row = settings[key] as { value?: { value?: unknown } } | undefined
  const value = row?.value?.value
  return typeof value === 'string' ? value : ''
}

/**
 * The school's logo and favicon, open on every plan. Colour lives in the theme
 * kit picker (#763), so this form sends only these two keys — `updateSettings`
 * refuses a whole payload that carries a theme key.
 */
export default function BrandingSettingsForm({ settings }: BrandingSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    try {
      const result = await updateSettings({
        logo_url: { value: formData.get('logo_url') as string },
        favicon_url: { value: formData.get('favicon_url') as string },
      })
      if (!result.success) throw new Error(result.error)
      toast.success(t('success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="logo_url">{t('branding.logoUrl')}</FieldLabel>
          <Input
            id="logo_url"
            name="logo_url"
            defaultValue={settingValue(settings, 'logo_url')}
            placeholder={t('branding.logoUrlPlaceholder')}
          />
          <FieldDescription>{t('branding.logoUrlHint')}</FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="favicon_url">{t('branding.faviconUrl')}</FieldLabel>
          <Input
            id="favicon_url"
            name="favicon_url"
            defaultValue={settingValue(settings, 'favicon_url')}
            placeholder={t('branding.faviconUrlPlaceholder')}
          />
          <FieldDescription>{t('branding.faviconUrlHint')}</FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 data-icon="inline-start" aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {isSubmitting ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  )
}
