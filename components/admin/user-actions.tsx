'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconDots, IconSettings, IconBan, IconCheck } from '@tabler/icons-react'
import { RoleAssignmentDialog } from './role-assignment-dialog'
import { ConfirmDialog } from './confirm-dialog'
import { deactivateUser, reactivateUser } from '@/app/actions/admin/users'

interface UserActionsProps {
  userId: string
  userName: string
  currentRoles: string[]
  isDeactivated: boolean
}

export function UserActions({
  userId,
  userName,
  currentRoles,
  isDeactivated
}: UserActionsProps) {
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [showReactivateDialog, setShowReactivateDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDeactivate = async () => {
    setLoading(true)
    const result = await deactivateUser(userId)

    if (result.success) {
      toast.success(`${userName} has been deactivated`)
      setShowDeactivateDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to deactivate user')
    }

    setLoading(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    const result = await reactivateUser(userId)

    if (result.success) {
      toast.success(`${userName} has been reactivated`)
      setShowReactivateDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Failed to reactivate user')
    }

    setLoading(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline" size="icon">
            <IconDots className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowRoleDialog(true)}>
            <IconSettings className="mr-2 h-4 w-4" />
            Manage Roles
          </DropdownMenuItem>
          {isDeactivated ? (
            <DropdownMenuItem onClick={() => setShowReactivateDialog(true)}>
              <IconCheck className="mr-2 h-4 w-4" />
              Reactivate User
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => setShowDeactivateDialog(true)}
              className="text-destructive"
            >
              <IconBan className="mr-2 h-4 w-4" />
              Deactivate User
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Role Assignment Dialog */}
      <RoleAssignmentDialog
        userId={userId}
        userName={userName}
        currentRoles={currentRoles}
        open={showRoleDialog}
        onOpenChange={(open) => {
          setShowRoleDialog(open)
          if (!open) router.refresh()
        }}
      />

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={showDeactivateDialog}
        onOpenChange={setShowDeactivateDialog}
        title="Deactivate User"
        description={`Are you sure you want to deactivate ${userName}? They will no longer be able to access the platform.`}
        confirmText="Deactivate"
        variant="destructive"
        onConfirm={handleDeactivate}
      />

      {/* Reactivate Confirmation */}
      <ConfirmDialog
        open={showReactivateDialog}
        onOpenChange={setShowReactivateDialog}
        title="Reactivate User"
        description={`Are you sure you want to reactivate ${userName}? They will regain access to the platform.`}
        confirmText="Reactivate"
        onConfirm={handleReactivate}
      />
    </>
  )
}
