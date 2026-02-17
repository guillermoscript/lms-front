'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateSettings } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface BrandingSettingsFormProps {
  settings: Record<string, any>
}

export default function BrandingSettingsForm({ settings }: BrandingSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const logoUrl = settings.logo_url?.value?.value || ''
  const faviconUrl = settings.favicon_url?.value?.value || ''
  const primaryColor = settings.primary_color?.value?.value || '#2563eb'
  const secondaryColor = settings.secondary_color?.value?.value || '#7c3aed'

  const [previewPrimary, setPreviewPrimary] = useState(primaryColor)
  const [previewSecondary, setPreviewSecondary] = useState(secondaryColor)
  const [previewLogo, setPreviewLogo] = useState(logoUrl)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        logo_url: { value: formData.get('logo_url') as string },
        favicon_url: { value: formData.get('favicon_url') as string },
        primary_color: { value: formData.get('primary_color') as string },
        secondary_color: { value: formData.get('secondary_color') as string },
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
      {/* Logo URL */}
      <div className="space-y-2">
        <Label htmlFor="logo_url">{t('branding.logoUrl')}</Label>
        <Input
          id="logo_url"
          name="logo_url"
          defaultValue={logoUrl}
          placeholder={t('branding.logoUrlPlaceholder')}
          onChange={(e) => setPreviewLogo(e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          {t('branding.logoUrlHint')}
        </p>
      </div>

      {/* Favicon URL */}
      <div className="space-y-2">
        <Label htmlFor="favicon_url">{t('branding.faviconUrl')}</Label>
        <Input
          id="favicon_url"
          name="favicon_url"
          defaultValue={faviconUrl}
          placeholder={t('branding.faviconUrlPlaceholder')}
        />
        <p className="text-sm text-muted-foreground">
          {t('branding.faviconUrlHint')}
        </p>
      </div>

      {/* Colors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Primary Color */}
        <div className="space-y-2">
          <Label htmlFor="primary_color">{t('branding.primaryColor')}</Label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              id="primary_color_picker"
              value={previewPrimary}
              onChange={(e) => {
                setPreviewPrimary(e.target.value)
                const input = document.getElementById('primary_color') as HTMLInputElement
                if (input) input.value = e.target.value
              }}
              className="w-10 h-10 rounded-lg border border-input cursor-pointer"
            />
            <Input
              id="primary_color"
              name="primary_color"
              defaultValue={primaryColor}
              placeholder="#2563eb"
              onChange={(e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                  setPreviewPrimary(e.target.value)
                }
              }}
              className="flex-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('branding.primaryColorHint')}
          </p>
        </div>

        {/* Secondary Color */}
        <div className="space-y-2">
          <Label htmlFor="secondary_color">{t('branding.secondaryColor')}</Label>
          <div className="flex gap-3 items-center">
            <input
              type="color"
              id="secondary_color_picker"
              value={previewSecondary}
              onChange={(e) => {
                setPreviewSecondary(e.target.value)
                const input = document.getElementById('secondary_color') as HTMLInputElement
                if (input) input.value = e.target.value
              }}
              className="w-10 h-10 rounded-lg border border-input cursor-pointer"
            />
            <Input
              id="secondary_color"
              name="secondary_color"
              defaultValue={secondaryColor}
              placeholder="#7c3aed"
              onChange={(e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                  setPreviewSecondary(e.target.value)
                }
              }}
              className="flex-1"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('branding.secondaryColorHint')}
          </p>
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <Label>{t('branding.preview')}</Label>
        <div className="rounded-xl border p-6 bg-muted/30">
          <div className="flex items-center gap-4 mb-4">
            {previewLogo ? (
              <img
                src={previewLogo}
                alt="Logo preview"
                className="h-10 max-w-[200px] object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : (
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                style={{ backgroundColor: previewPrimary }}
              >
                L
              </div>
            )}
            <span className="font-bold text-lg">Your Platform</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: previewPrimary }}
            >
              Primary Button
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: previewSecondary }}
            >
              Secondary Button
            </button>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            {t('branding.previewHint')}
          </p>
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
