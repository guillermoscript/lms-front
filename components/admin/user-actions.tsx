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
import { useTranslations } from 'next-intl'

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
  const t = useTranslations('dashboard.admin.users.actions')
  const [showRoleDialog, setShowRoleDialog] = useState(false)
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [showReactivateDialog, setShowReactivateDialog] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDeactivate = async () => {
    setLoading(true)
    const result = await deactivateUser(userId)

    if (result.success) {
      toast.success(t('toasts.deactivateSuccess', { name: userName }))
      setShowDeactivateDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.deactivateError'))
    }

    setLoading(false)
  }

  const handleReactivate = async () => {
    setLoading(true)
    const result = await reactivateUser(userId)

    if (result.success) {
      toast.success(t('toasts.reactivateSuccess', { name: userName }))
      setShowReactivateDialog(false)
      router.refresh()
    } else {
      toast.error(result.error || t('toasts.reactivateError'))
    }

    setLoading(false)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="outline" size="icon" aria-label={t('menu')}>
            <IconDots className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowRoleDialog(true)}>
            <IconSettings className="mr-2 h-4 w-4" />
            {t('manageRoles')}
          </DropdownMenuItem>
          {isDeactivated ? (
            <DropdownMenuItem onClick={() => setShowReactivateDialog(true)}>
              <IconCheck className="mr-2 h-4 w-4" />
              {t('reactivate')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => setShowDeactivateDialog(true)}
              className="text-destructive"
            >
              <IconBan className="mr-2 h-4 w-4" />
              {t('deactivate')}
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
        title={t('dialogs.deactivate.title')}
        description={t('dialogs.deactivate.description', { name: userName })}
        confirmText={t('dialogs.deactivate.confirm')}
        cancelText={t('dialogs.cancel')}
        variant="destructive"
        onConfirm={handleDeactivate}
      />

      {/* Reactivate Confirmation */}
      <ConfirmDialog
        open={showReactivateDialog}
        onOpenChange={setShowReactivateDialog}
        title={t('dialogs.reactivate.title')}
        description={t('dialogs.reactivate.description', { name: userName })}
        confirmText={t('dialogs.reactivate.confirm')}
        cancelText={t('dialogs.cancel')}
        onConfirm={handleReactivate}
      />
    </>
  )
}
