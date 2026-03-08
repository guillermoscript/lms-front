'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconDots, IconX, IconRefresh, IconEye } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  cancelSubscription,
  reactivateSubscription,
} from '@/app/actions/admin/subscriptions'
import { useTranslations } from 'next-intl'

interface SubscriptionActionsProps {
  subscriptionId: number
  userId: string
  status: string
  cancelAtPeriodEnd: boolean
}

export function SubscriptionActions({
  subscriptionId,
  userId,
  status,
  cancelAtPeriodEnd,
}: SubscriptionActionsProps) {
  const t = useTranslations('dashboard.admin.subscriptions')
  const router = useRouter()
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [reactivateDialogOpen, setReactivateDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleCancel = async (immediate: boolean) => {
    setLoading(true)
    try {
      const result = await cancelSubscription(subscriptionId, immediate)

      if (result.success) {
        toast.success(
          immediate
            ? t('toasts.cancelImmediate')
            : t('toasts.cancelAtEnd')
        )
        setCancelDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t('toasts.cancelError'))
      }
    } catch (error) {
      toast.error(t('toasts.generalError'))
      console.error('Cancel subscription error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReactivate = async () => {
    setLoading(true)
    try {
      const result = await reactivateSubscription(subscriptionId)

      if (result.success) {
        toast.success(t('toasts.reactivateSuccess'))
        setReactivateDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || t('toasts.reactivateError'))
      }
    } catch (error) {
      toast.error(t('toasts.generalError'))
      console.error('Reactivate subscription error:', error)
    } finally {
      setLoading(false)
    }
  }

  const isActive = status === 'active'
  const isCancelled = status === 'cancelled'

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Button variant="ghost" size="icon" aria-label={t('actions.menu')}>
            <IconDots className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/users/${userId}`)}>
            <IconEye className="mr-2 h-4 w-4" />
            {t('actions.viewUser')}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {isActive && !cancelAtPeriodEnd && (
            <DropdownMenuItem
              onClick={() => setCancelDialogOpen(true)}
              className="text-orange-600"
            >
              <IconX className="mr-2 h-4 w-4" />
              {t('actions.cancel')}
            </DropdownMenuItem>
          )}

          {cancelAtPeriodEnd && (
            <DropdownMenuItem
              onClick={() => setReactivateDialogOpen(true)}
              className="text-green-600"
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              {t('actions.reactivate')}
            </DropdownMenuItem>
          )}

          {isCancelled && (
            <DropdownMenuItem disabled className="text-muted-foreground">
              <IconRefresh className="mr-2 h-4 w-4" />
              {t('actions.cannotReactivate')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogs.cancel.title')}</DialogTitle>
            <DialogDescription>
              {t('dialogs.cancel.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">{t('dialogs.cancel.options')}</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>{t('dialogs.cancel.atEnd')}:</strong> {t('dialogs.cancel.atEndDesc')}
                </p>
                <p>
                  <strong>{t('dialogs.cancel.immediate')}:</strong> {t('dialogs.cancel.immediateDesc')}
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={loading}
            >
              {t('dialogs.cancel.close')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCancel(false)}
              disabled={loading}
            >
              {t('dialogs.cancel.atEnd')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleCancel(true)}
              disabled={loading}
            >
              {loading ? t('actions.cancelling') : t('dialogs.cancel.immediate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Dialog */}
      <Dialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dialogs.reactivate.title')}</DialogTitle>
            <DialogDescription>
              {t('dialogs.reactivate.description')}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReactivateDialogOpen(false)}
              disabled={loading}
            >
              {t('dialogs.cancel.close')}
            </Button>
            <Button onClick={handleReactivate} disabled={loading}>
              {loading ? t('actions.reactivating') : t('actions.reactivate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
