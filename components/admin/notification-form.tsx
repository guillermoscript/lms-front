'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createNotification, dispatchNotification } from '@/app/actions/admin/notifications'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface NotificationFormProps {
  onSuccess?: () => void
}

export default function NotificationForm({ onSuccess }: NotificationFormProps) {
  const t = useTranslations('dashboard.admin.notifications')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [targetType, setTargetType] = useState<string>('all')
  const [sendNow, setSendNow] = useState(true)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const data = {
        title: formData.get('title') as string,
        content: formData.get('content') as string,
        notification_type: formData.get('notification_type') as any,
        priority: formData.get('priority') as any,
        target_type: targetType as any,
        target_roles: targetType === 'role'
          ? (formData.get('target_roles') as string).split(',').map(r => r.trim()).filter(Boolean)
          : undefined,
        target_course_id: targetType === 'course'
          ? parseInt(formData.get('target_course_id') as string)
          : undefined,
        delivery_channels: ['in_app'], // Default to in-app for now
        scheduled_for: !sendNow ? (formData.get('scheduled_for') as string) : null,
      }

      const result = await createNotification(data)

      if (result.success && result.data) {
        // If sending now, dispatch the notification
        if (sendNow) {
          await dispatchNotification(result.data.id)
        }

        toast.success(sendNow ? t('form.toasts.success') : t('form.toasts.draft'))
        onSuccess?.()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('form.toasts.error'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">{t('form.title')}</Label>
        <Input
          id="title"
          name="title"
          placeholder={t('form.titlePlaceholder')}
          required
        />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content">{t('form.message')}</Label>
        <Textarea
          id="content"
          name="content"
          placeholder={t('form.messagePlaceholder')}
          rows={6}
          required
        />
        <p className="text-sm text-muted-foreground">
          {t('form.messageHint')}
        </p>
      </div>

      {/* Type & Priority */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notification_type">{t('form.type')}</Label>
          <Select name="notification_type" defaultValue="info" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="announcement">{t('types.announcement')}</SelectItem>
              <SelectItem value="alert">{t('types.alert')}</SelectItem>
              <SelectItem value="info">{t('types.info')}</SelectItem>
              <SelectItem value="success">{t('types.success')}</SelectItem>
              <SelectItem value="warning">{t('types.warning')}</SelectItem>
              <SelectItem value="error">{t('types.error')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">{t('form.priority')}</Label>
          <Select name="priority" defaultValue="normal" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t('priorityOptions.low')}</SelectItem>
              <SelectItem value="normal">{t('priorityOptions.normal')}</SelectItem>
              <SelectItem value="high">{t('priorityOptions.high')}</SelectItem>
              <SelectItem value="urgent">{t('priorityOptions.urgent')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Target Type */}
      <div className="space-y-2">
        <Label htmlFor="target_type">{t('form.sendTo')}</Label>
        <Select
          name="target_type"
          value={targetType}
          onValueChange={(value) => value && setTargetType(value)}
          required
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('targets.all')}</SelectItem>
            <SelectItem value="role">{t('targets.role')}</SelectItem>
            <SelectItem value="course">{t('targets.course')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional Target Fields */}
      {targetType === 'role' && (
        <div className="space-y-2">
          <Label htmlFor="target_roles">{t('form.roles')}</Label>
          <Input
            id="target_roles"
            name="target_roles"
            placeholder={t('form.rolesPlaceholder')}
            required
          />
          <p className="text-sm text-muted-foreground">
            {t('form.rolesHint')}
          </p>
        </div>
      )}

      {targetType === 'course' && (
        <div className="space-y-2">
          <Label htmlFor="target_course_id">{t('form.courseId')}</Label>
          <Input
            id="target_course_id"
            name="target_course_id"
            type="number"
            placeholder={t('form.courseIdPlaceholder')}
            required
          />
          <p className="text-sm text-muted-foreground">
            {t('form.courseIdHint')}
          </p>
        </div>
      )}

      {/* Send Now or Schedule */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>{t('form.delivery')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('form.deliveryDesc')}
            </p>
          </div>
          <Select
            value={sendNow ? 'now' : 'schedule'}
            onValueChange={(value) => setSendNow(value === 'now')}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="now">{t('form.deliveryOptions.now')}</SelectItem>
              <SelectItem value="schedule">{t('form.deliveryOptions.schedule')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!sendNow && (
          <div className="space-y-2">
            <Label htmlFor="scheduled_for">{t('form.scheduleFor')}</Label>
            <Input
              id="scheduled_for"
              name="scheduled_for"
              type="datetime-local"
              required={!sendNow}
            />
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {sendNow ? t('form.submit.send') : t('form.submit.save')}
        </Button>
      </div>
    </form>
  )
}
