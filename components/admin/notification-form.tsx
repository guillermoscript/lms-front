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

interface NotificationFormProps {
  onSuccess?: () => void
}

export default function NotificationForm({ onSuccess }: NotificationFormProps) {
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

        toast.success(sendNow ? 'Notification sent successfully' : 'Notification saved as draft')
        onSuccess?.()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create notification')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-6">
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          placeholder="Notification title"
          required
        />
      </div>

      {/* Content */}
      <div className="space-y-2">
        <Label htmlFor="content">Message</Label>
        <Textarea
          id="content"
          name="content"
          placeholder="Enter your notification message..."
          rows={6}
          required
        />
        <p className="text-sm text-muted-foreground">
          Use double curly braces for dynamic content with templates
        </p>
      </div>

      {/* Type & Priority */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="notification_type">Type</Label>
          <Select name="notification_type" defaultValue="info" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="alert">Alert</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select name="priority" defaultValue="normal" required>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Target Type */}
      <div className="space-y-2">
        <Label htmlFor="target_type">Send To</Label>
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
            <SelectItem value="all">All Users</SelectItem>
            <SelectItem value="role">Specific Role</SelectItem>
            <SelectItem value="course">Course Students</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Conditional Target Fields */}
      {targetType === 'role' && (
        <div className="space-y-2">
          <Label htmlFor="target_roles">Roles (comma-separated)</Label>
          <Input
            id="target_roles"
            name="target_roles"
            placeholder="student, teacher"
            required
          />
          <p className="text-sm text-muted-foreground">
            Example: student, teacher, admin
          </p>
        </div>
      )}

      {targetType === 'course' && (
        <div className="space-y-2">
          <Label htmlFor="target_course_id">Course ID</Label>
          <Input
            id="target_course_id"
            name="target_course_id"
            type="number"
            placeholder="Enter course ID"
            required
          />
          <p className="text-sm text-muted-foreground">
            Find course ID in the courses management page
          </p>
        </div>
      )}

      {/* Send Now or Schedule */}
      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Delivery</Label>
            <p className="text-sm text-muted-foreground">
              Send immediately or schedule for later
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
              <SelectItem value="now">Send Now</SelectItem>
              <SelectItem value="schedule">Schedule</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!sendNow && (
          <div className="space-y-2">
            <Label htmlFor="scheduled_for">Schedule For</Label>
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
          {sendNow ? 'Send Notification' : 'Save Draft'}
        </Button>
      </div>
    </form>
  )
}
