'use client'

/**
 * Student self-service subscription cancel / reactivate (issue #464).
 *
 * Renders in the non-`solana_subs` branch of the billing subscription card:
 * - not scheduled to cancel → a "Cancel subscription" button that opens a
 *   confirm dialog and calls `cancelMySubscription` (cancel at period end).
 * - already scheduled to cancel → a "Resume subscription" button that calls
 *   `reactivateMySubscription` to undo it before the period ends.
 *
 * `solana_subs` uses RevokeSolanaDelegation instead — the server cannot revoke
 * the on-chain delegation.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconX, IconRefresh, IconAlertTriangle } from '@tabler/icons-react'
import { cancelMySubscription, reactivateMySubscription } from '@/app/actions/subscriptions'

export function ManageSubscription({
  subscriptionId,
  cancelAtPeriodEnd,
}: {
  subscriptionId: number
  cancelAtPeriodEnd: boolean
}) {
  const t = useTranslations('dashboard.student.billing.subscription.manage')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const handleCancel = () => {
    startTransition(async () => {
      const res = await cancelMySubscription(subscriptionId)
      if (res.success) {
        // We recorded the cancel, but the payment provider couldn't be reached —
        // warn instead of promising "no further charges", so the student knows to
        // confirm with the school (mirrors the admin cancel UI).
        if (res.providerWarning) toast.warning(t('providerWarning'))
        else toast.success(t('cancelSuccess'))
        setOpen(false)
        router.refresh()
      } else {
        toast.error(t('cancelError'))
      }
    })
  }

  const handleReactivate = () => {
    startTransition(async () => {
      const res = await reactivateMySubscription(subscriptionId)
      if (res.success) {
        if (res.providerWarning) toast.warning(t('providerWarning'))
        else toast.success(t('reactivateSuccess'))
        router.refresh()
      } else {
        toast.error(t('reactivateError'))
      }
    })
  }

  if (cancelAtPeriodEnd) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleReactivate}
        disabled={pending}
      >
        <IconRefresh className="h-3.5 w-3.5" />
        {pending ? t('reactivateWorking') : t('reactivateButton')}
      </Button>
    )
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive"
        onClick={() => setOpen(true)}
      >
        <IconX className="h-3.5 w-3.5" />
        {t('cancelButton')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmBody')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            <IconAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{t('confirmNote')}</span>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              {t('confirmKeep')}
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={pending}>
              {pending ? t('cancelWorking') : t('confirmCancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
