'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { updateSettings } from '@/app/actions/admin/settings'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface EnrollmentSettingsFormProps {
  settings: Record<string, any>
}

export default function EnrollmentSettingsForm({ settings }: EnrollmentSettingsFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Extract current values
  const autoEnrollment = settings.auto_enrollment?.value?.enabled ?? false
  const requireEnrollmentApproval = settings.require_enrollment_approval?.value?.enabled ?? false
  const maxEnrollmentsPerUser = settings.max_enrollments_per_user?.value?.value || 0
  const allowSelfEnrollment = settings.allow_self_enrollment?.value?.enabled ?? true
  const enrollmentExpirationDays = settings.enrollment_expiration_days?.value?.value || 365
  const courseCapacityEnabled = settings.course_capacity_enabled?.value?.enabled ?? false

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)

    try {
      const updatedSettings = {
        auto_enrollment: { enabled: formData.get('auto_enrollment') === 'on' },
        require_enrollment_approval: { enabled: formData.get('require_enrollment_approval') === 'on' },
        max_enrollments_per_user: { value: parseInt(formData.get('max_enrollments_per_user') as string) },
        allow_self_enrollment: { enabled: formData.get('allow_self_enrollment') === 'on' },
        enrollment_expiration_days: { value: parseInt(formData.get('enrollment_expiration_days') as string) },
        course_capacity_enabled: { enabled: formData.get('course_capacity_enabled') === 'on' },
      }

      const result = await updateSettings(updatedSettings)

      if (result.success) {
        toast.success('Enrollment settings updated successfully')
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
      {/* Auto Enrollment */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="auto_enrollment">Auto Enrollment</Label>
          <p className="text-sm text-muted-foreground">
            Automatically enroll new users in designated courses
          </p>
        </div>
        <Switch
          id="auto_enrollment"
          name="auto_enrollment"
          defaultChecked={autoEnrollment}
        />
      </div>

      {/* Self Enrollment */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="allow_self_enrollment">Allow Self Enrollment</Label>
          <p className="text-sm text-muted-foreground">
            Allow students to enroll themselves in courses
          </p>
        </div>
        <Switch
          id="allow_self_enrollment"
          name="allow_self_enrollment"
          defaultChecked={allowSelfEnrollment}
        />
      </div>

      {/* Require Approval */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="require_enrollment_approval">Require Enrollment Approval</Label>
          <p className="text-sm text-muted-foreground">
            Require admin approval before students can access courses
          </p>
        </div>
        <Switch
          id="require_enrollment_approval"
          name="require_enrollment_approval"
          defaultChecked={requireEnrollmentApproval}
        />
      </div>

      {/* Max Enrollments */}
      <div className="space-y-2">
        <Label htmlFor="max_enrollments_per_user">Maximum Enrollments Per User</Label>
        <Input
          id="max_enrollments_per_user"
          name="max_enrollments_per_user"
          type="number"
          min="0"
          defaultValue={maxEnrollmentsPerUser}
          placeholder="0"
        />
        <p className="text-sm text-muted-foreground">
          Maximum number of courses a user can enroll in (0 = unlimited)
        </p>
      </div>

      {/* Enrollment Expiration */}
      <div className="space-y-2">
        <Label htmlFor="enrollment_expiration_days">Enrollment Expiration (Days)</Label>
        <Input
          id="enrollment_expiration_days"
          name="enrollment_expiration_days"
          type="number"
          min="0"
          defaultValue={enrollmentExpirationDays}
          placeholder="365"
        />
        <p className="text-sm text-muted-foreground">
          Number of days until enrollment expires (0 = never expires)
        </p>
      </div>

      {/* Course Capacity */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label htmlFor="course_capacity_enabled">Enable Course Capacity</Label>
          <p className="text-sm text-muted-foreground">
            Allow setting maximum student limits for courses
          </p>
        </div>
        <Switch
          id="course_capacity_enabled"
          name="course_capacity_enabled"
          defaultChecked={courseCapacityEnabled}
        />
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
