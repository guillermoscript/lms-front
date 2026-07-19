'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react'
import { previewPlanChange, changePlan } from '@/app/actions/admin/billing'

export type PlanChangeDirection = 'upgrade' | 'downgrade' | 'interval'

export interface PlanChangeTarget {
  planId: string
  planName: string
  interval: 'monthly' | 'yearly'
  direction: PlanChangeDirection
}

interface PlanLimitViolation {
  resource: 'courses' | 'students'
  current: number
  max: number
  reduceBy: number
}

type PreviewState =
  | { kind: 'loading' }
  | { kind: 'blocked'; violations: PlanLimitViolation[]; planName: string | null }
  | { kind: 'ready'; proration: { prorationAmount: number; total: number; currency: string } | null }
  | { kind: 'error' }

interface PlanChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  target: PlanChangeTarget | null
  /** Called after the change is applied successfully (e.g. to navigate). */
  onConfirmed: () => void
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)
}

export function PlanChangeDialog({ open, onOpenChange, target, onConfirmed }: PlanChangeDialogProps) {
  const t = useTranslations('dashboard.admin.billing.changePlan')
  const [preview, setPreview] = useState<PreviewState>({ kind: 'loading' })
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!open || !target) return
    let cancelled = false
    // Loader lives inside the effect (cancelled-flag pattern) so the loading
    // reset runs in an async context, satisfying react-hooks/set-state-in-effect.
    const load = async () => {
      setPreview({ kind: 'loading' })
      try {
        const res = await previewPlanChange(target.planId, target.interval)
        if (cancelled) return
        if (!res.ok) {
          setPreview({ kind: 'blocked', violations: res.violations, planName: res.planName })
        } else {
          setPreview({ kind: 'ready', proration: res.proration })
        }
      } catch {
        if (!cancelled) setPreview({ kind: 'error' })
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, target])

  const title =
    target?.direction === 'upgrade'
      ? t('upgradeTitle', { plan: target?.planName ?? '' })
      : target?.direction === 'downgrade'
        ? t('downgradeTitle', { plan: target?.planName ?? '' })
        : t('intervalTitle', { plan: target?.planName ?? '' })

  const blocked = preview.kind === 'blocked'

  const handleConfirm = async () => {
    if (!target) return
    setConfirming(true)
    try {
      await changePlan(target.planId, target.interval)
      toast.success(t('success'))
      onOpenChange(false)
      onConfirmed()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('error'))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{blocked ? t('overLimitTitle', { plan: preview.planName ?? target?.planName ?? '' }) : title}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked ? t('overLimitIntro') : t('previewIntro')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="text-sm">
          {preview.kind === 'loading' && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <IconLoader2 className="h-4 w-4 animate-spin" />
              {t('loadingPreview')}
            </p>
          )}

          {preview.kind === 'error' && (
            <p className="text-muted-foreground">{t('previewUnavailable')}</p>
          )}

          {preview.kind === 'blocked' && (
            <ul className="space-y-2">
              {preview.violations.map((v) => (
                <li key={v.resource} className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50 p-3 text-amber-900 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-200">
                  <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {v.resource === 'courses'
                      ? t('violationCourses', { current: v.current, max: v.max, reduceBy: v.reduceBy })
                      : t('violationStudents', { current: v.current, max: v.max, reduceBy: v.reduceBy })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {preview.kind === 'ready' && (
            preview.proration ? (
              <dl className="space-y-2 rounded-lg border bg-muted/25 p-3.5">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {preview.proration.prorationAmount < 0 ? t('prorationCredit') : t('prorationDueNow')}
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {money(Math.abs(preview.proration.prorationAmount), preview.proration.currency)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4 border-t pt-2">
                  <dt className="text-muted-foreground">{t('nextInvoiceTotal')}</dt>
                  <dd className="font-semibold tabular-nums">
                    {money(preview.proration.total, preview.proration.currency)}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-muted-foreground">{t('previewUnavailable')}</p>
            )
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={confirming}>
            {blocked ? t('close') : t('cancel')}
          </AlertDialogCancel>
          {!blocked && (
            <Button onClick={handleConfirm} disabled={confirming || preview.kind === 'loading'}>
              {confirming && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('confirm')}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
