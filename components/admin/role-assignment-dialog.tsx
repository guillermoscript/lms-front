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

interface RoleAssignmentDialogProps {
  userId: string
  userName: string
  currentRoles: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

const AVAILABLE_ROLES = [
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'teacher', label: 'Teacher', description: 'Can create and manage courses' },
  { value: 'student', label: 'Student', description: 'Can enroll in and complete courses' }
] as const

export function RoleAssignmentDialog({
  userId,
  userName,
  currentRoles,
  open,
  onOpenChange
}: RoleAssignmentDialogProps) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles)
  const [loading, setLoading] = useState(false)

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
      toast.success(`Roles updated for ${userName}`)
      onOpenChange(false)
    } else {
      toast.error(result.error || 'Failed to update roles')
    }

    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Roles</DialogTitle>
          <DialogDescription>
            Update roles for {userName}. Users can have multiple roles.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {AVAILABLE_ROLES.map(role => (
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
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
