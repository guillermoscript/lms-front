'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { updateUserRoles } from '@/app/actions/admin/users'
import { useTranslations } from 'next-intl'

interface RoleAssignmentDialogProps {
  userId: string
  userName: string
  currentRoles: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function RoleAssignmentDialog({
  userId,
  userName,
  currentRoles,
  open,
  onOpenChange
}: RoleAssignmentDialogProps) {
  const t = useTranslations('dashboard.admin.users.actions.dialogs.roles')
  const tt = useTranslations('dashboard.admin.users.actions.toasts')
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles)
  const [loading, setLoading] = useState(false)

  const roles = [
    { value: 'admin', label: t('admin.label'), description: t('admin.description') },
    { value: 'teacher', label: t('teacher.label'), description: t('teacher.description') },
    { value: 'student', label: t('student.label'), description: t('student.description') }
  ] as const

  const handleRoleToggle = (role: string) => {
    setSelectedRoles(prev =>
      prev.includes(role)
        ? prev.filter(r => r !== role)
        : [...prev, role]
    )
  }

  const handleSubmit = async () => {
    setLoading(true)

    const result = await updateUserRoles(
      userId,
      selectedRoles as ('admin' | 'teacher' | 'student')[]
    )

    if (result.success) {
      toast.success(tt('rolesSuccess', { name: userName }))
      onOpenChange(false)
    } else {
      toast.error(result.error || tt('rolesError'))
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {t('description', { name: userName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {roles.map(role => (
            <div key={role.value} className="flex items-start space-x-3">
              <Checkbox
                id={`role-${role.value}`}
                checked={selectedRoles.includes(role.value)}
                onCheckedChange={() => handleRoleToggle(role.value)}
                disabled={loading}
              />
              <div className="grid gap-1.5 leading-none">
                <Label
                  htmlFor={`role-${role.value}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {role.label}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {role.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {useTranslations('dashboard.admin.users.actions.dialogs')('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
