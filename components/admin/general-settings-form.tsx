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

interface GeneralSettingsFormProps {
  settings: Record<string, any>
}

export default function GeneralSettingsForm({ settings }: GeneralSettingsFormProps) {
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
        toast.success('General settings updated successfully')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update settings')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Site Name */}
      <div className="space-y-2">
        <Label htmlFor="site_name">Site Name</Label>
        <Input
          id="site_name"
          name="site_name"
          defaultValue={siteName}
          placeholder="My LMS Platform"
          required
        />
        <p className="text-sm text-muted-foreground">
          The name of your platform displayed across the site
        </p>
      </div>

      {/* Site Description */}
      <div className="space-y-2">
        <Label htmlFor="site_description">Site Description</Label>
        <Textarea
          id="site_description"
          name="site_description"
          defaultValue={siteDescription}
          placeholder="A modern learning management system..."
          rows={3}
        />
        <p className="text-sm text-muted-foreground">
          Used for SEO and about pages
        </p>
      </div>

      {/* Contact Email */}
      <div className="space-y-2">
        <Label htmlFor="contact_email">Contact Email</Label>
        <Input
          id="contact_email"
          name="contact_email"
          type="email"
          defaultValue={contactEmail}
          placeholder="contact@example.com"
          required
        />
        <p className="text-sm text-muted-foreground">
          Main contact email for the platform
        </p>
      </div>

      {/* Support Email */}
      <div className="space-y-2">
        <Label htmlFor="support_email">Support Email</Label>
        <Input
          id="support_email"
          name="support_email"
          type="email"
          defaultValue={supportEmail}
          placeholder="support@example.com"
          required
        />
        <p className="text-sm text-muted-foreground">
          Support email for user inquiries
        </p>
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label htmlFor="timezone">Timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          defaultValue={timezone}
          placeholder="America/New_York"
          required
        />
        <p className="text-sm text-muted-foreground">
          Default timezone for the platform (e.g., America/New_York, Europe/London)
        </p>
      </div>

      {/* Maintenance Mode */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="maintenance_mode">Maintenance Mode</Label>
            <p className="text-sm text-muted-foreground">
              Enable to show maintenance message to users
            </p>
          </div>
          <Switch
            id="maintenance_mode"
            name="maintenance_mode"
            defaultChecked={maintenanceMode}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="maintenance_message">Maintenance Message</Label>
          <Textarea
            id="maintenance_message"
            name="maintenance_message"
            defaultValue={maintenanceMessage}
            placeholder="We're currently performing maintenance. Please check back soon."
            rows={3}
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  )
}
