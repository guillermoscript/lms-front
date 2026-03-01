'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateSettings } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2, Eye, EyeOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface EmailSettingsFormProps {
  settings: Record<string, any>
}

export default function EmailSettingsForm({ settings }: EmailSettingsFormProps) {
  const t = useTranslations('dashboard.admin.settings.form')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Extract current values
  const smtpHost = settings.smtp_host?.value?.value || ''
  const smtpPort = settings.smtp_port?.value?.value || 587
  const smtpUsername = settings.smtp_username?.value?.value || ''
  const smtpPassword = settings.smtp_password?.value?.value || ''
  const smtpFromEmail = settings.smtp_from_email?.value?.value || ''
  const smtpFromName = settings.smtp_from_name?.value?.value || ''
  const emailNotifications = settings.email_notifications?.value?.enabled || false

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        smtp_host: { value: formData.get('smtp_host') as string },
        smtp_port: { value: parseInt(formData.get('smtp_port') as string) },
        smtp_username: { value: formData.get('smtp_username') as string },
        smtp_password: { value: formData.get('smtp_password') as string },
        smtp_from_email: { value: formData.get('smtp_from_email') as string },
        smtp_from_name: { value: formData.get('smtp_from_name') as string },
        email_notifications: { enabled: formData.get('email_notifications') === 'on' },
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
      {/* Email Notifications Toggle */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="email_notifications">{t('email.notifications')}</Label>
          <p className="text-sm text-muted-foreground">
            {t('email.notificationsHint')}
          </p>
        </div>
        <Switch
          id="email_notifications"
          name="email_notifications"
          defaultChecked={emailNotifications}
        />
      </div>

      {/* SMTP Settings */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">{t('email.smtpConfig')}</h3>

        {/* SMTP Host */}
        <div className="space-y-2">
          <Label htmlFor="smtp_host">{t('email.smtpHost')}</Label>
          <Input
            id="smtp_host"
            name="smtp_host"
            defaultValue={smtpHost}
            placeholder="smtp.example.com"
          />
          <p className="text-sm text-muted-foreground">
            {t('email.smtpHostHint')}
          </p>
        </div>

        {/* SMTP Port */}
        <div className="space-y-2">
          <Label htmlFor="smtp_port">{t('email.smtpPort')}</Label>
          <Input
            id="smtp_port"
            name="smtp_port"
            type="number"
            defaultValue={smtpPort}
            placeholder="587"
          />
          <p className="text-sm text-muted-foreground">
            {t('email.smtpPortHint')}
          </p>
        </div>

        {/* SMTP Username */}
        <div className="space-y-2">
          <Label htmlFor="smtp_username">{t('email.smtpUsername')}</Label>
          <Input
            id="smtp_username"
            name="smtp_username"
            defaultValue={smtpUsername}
            placeholder="your-username"
            autoComplete="username"
          />
          <p className="text-sm text-muted-foreground">
            {t('email.smtpUsernameHint')}
          </p>
        </div>

        {/* SMTP Password */}
        <div className="space-y-2">
          <Label htmlFor="smtp_password">{t('email.smtpPassword')}</Label>
          <div className="relative">
            <Input
              id="smtp_password"
              name="smtp_password"
              type={showPassword ? 'text' : 'password'}
              defaultValue={smtpPassword}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('email.smtpPasswordHint')}
          </p>
        </div>
      </div>

      {/* Sender Settings */}
      <div className="space-y-4 rounded-lg border p-4">
        <h3 className="font-semibold">{t('email.senderInfo')}</h3>

        {/* From Email */}
        <div className="space-y-2">
          <Label htmlFor="smtp_from_email">{t('email.fromEmail')}</Label>
          <Input
            id="smtp_from_email"
            name="smtp_from_email"
            type="email"
            defaultValue={smtpFromEmail}
            placeholder="noreply@example.com"
            required
          />
          <p className="text-sm text-muted-foreground">
            {t('email.fromEmailHint')}
          </p>
        </div>

        {/* From Name */}
        <div className="space-y-2">
          <Label htmlFor="smtp_from_name">{t('email.fromName')}</Label>
          <Input
            id="smtp_from_name"
            name="smtp_from_name"
            defaultValue={smtpFromName}
            placeholder="LMS Platform"
            required
          />
          <p className="text-sm text-muted-foreground">
            {t('email.fromNameHint')}
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
