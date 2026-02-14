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
            ? 'Subscription cancelled immediately'
            : 'Subscription will cancel at period end'
        )
        setCancelDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to cancel subscription')
      }
    } catch (error) {
      toast.error('An error occurred while cancelling the subscription')
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
        toast.success('Subscription reactivated successfully')
        setReactivateDialogOpen(false)
        router.refresh()
      } else {
        toast.error(result.error || 'Failed to reactivate subscription')
      }
    } catch (error) {
      toast.error('An error occurred while reactivating the subscription')
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
          <Button variant="ghost" size="icon">
            <IconDots className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/users/${userId}`)}>
            <IconEye className="mr-2 h-4 w-4" />
            View User
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {isActive && !cancelAtPeriodEnd && (
            <DropdownMenuItem
              onClick={() => setCancelDialogOpen(true)}
              className="text-orange-600"
            >
              <IconX className="mr-2 h-4 w-4" />
              Cancel Subscription
            </DropdownMenuItem>
          )}

          {cancelAtPeriodEnd && (
            <DropdownMenuItem
              onClick={() => setReactivateDialogOpen(true)}
              className="text-green-600"
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              Reactivate Subscription
            </DropdownMenuItem>
          )}

          {isCancelled && (
            <DropdownMenuItem disabled className="text-muted-foreground">
              <IconRefresh className="mr-2 h-4 w-4" />
              Cannot Reactivate (Expired)
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Choose how you want to cancel this subscription. This action will be
              synced with Stripe.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <h4 className="font-medium">Cancellation Options:</h4>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong>Cancel at Period End:</strong> User keeps access until the
                  current billing period ends. Recommended for better user experience.
                </p>
                <p>
                  <strong>Cancel Immediately:</strong> User loses access immediately.
                  Use only for urgent situations (fraud, violations, etc.).
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
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCancel(false)}
              disabled={loading}
            >
              Cancel at Period End
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleCancel(true)}
              disabled={loading}
            >
              {loading ? 'Cancelling...' : 'Cancel Immediately'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate Dialog */}
      <Dialog open={reactivateDialogOpen} onOpenChange={setReactivateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate Subscription</DialogTitle>
            <DialogDescription>
              This will reactivate the subscription that was scheduled to cancel at
              period end. The user will continue to be billed.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReactivateDialogOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleReactivate} disabled={loading}>
              {loading ? 'Reactivating...' : 'Reactivate Subscription'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
