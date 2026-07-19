'use client'

/**
 * Student plan-change ("switch") dialog (#463).
 *
 * Lists the other plans on the SAME school + payment provider and switches to
 * one via the `changePlan` server action — a supersession (the current plan is
 * replaced, never a second live subscription). Native providers (Stripe/LS)
 * prorate; self-managed providers (manual/crypto) carry the remaining period.
 * Two clicks: open → Switch.
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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { IconArrowsExchange, IconInfoCircle } from '@tabler/icons-react'
import { changePlan } from '@/app/[locale]/(public)/checkout/actions'

export interface SwitchablePlan {
  plan_id: number
  plan_name: string
  price: number
  payment_provider: string | null
}

interface ChangePlanDialogProps {
  currentPlanId: number
  /** The active subscription's payment provider — only same-provider plans switch. */
  currentProvider: string
  /** Native providers prorate; others carry the remaining period. Drives the note. */
  isNativeSwap: boolean
  plans: SwitchablePlan[]
}

export function ChangePlanDialog({
  currentPlanId,
  currentProvider,
  isNativeSwap,
  plans,
}: ChangePlanDialogProps) {
  const t = useTranslations('dashboard.student.billing.subscription.changePlan')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [busyPlanId, setBusyPlanId] = useState<number | null>(null)

  // Only plans on the same provider (a cross-provider switch needs a new
  // checkout), excluding the plan the student is already on.
  const switchable = plans.filter(
    (p) => p.plan_id !== currentPlanId && (p.payment_provider ?? 'manual') === currentProvider,
  )

  const handleSwitch = (planId: number) => {
    setBusyPlanId(planId)
    startTransition(async () => {
      try {
        await changePlan(String(planId))
        toast.success(t('success'))
        setOpen(false)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t('error'))
      } finally {
        setBusyPlanId(null)
      }
    })
  }

  const priceLabel = (price: number) =>
    Number(price) === 0
      ? t('free')
      : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(price))

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        data-testid="change-plan-button"
        onClick={() => setOpen(true)}
      >
        <IconArrowsExchange className="h-3.5 w-3.5" />
        {t('button')}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          {switchable.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">{t('noPlans')}</p>
          ) : (
            <>
              <ul className="flex flex-col gap-2">
                {switchable.map((plan) => (
                  <li
                    key={plan.plan_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{plan.plan_name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">{priceLabel(plan.price)}</p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSwitch(plan.plan_id)}
                      disabled={pending}
                    >
                      {busyPlanId === plan.plan_id ? t('switching') : t('switch')}
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex items-start gap-2 rounded-md bg-muted/50 border border-border px-3 py-2 text-xs text-muted-foreground">
                <IconInfoCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{isNativeSwap ? t('prorationNote') : t('manualNote')}</span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
