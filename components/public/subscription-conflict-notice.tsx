import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { SwitchPlanButton } from '@/components/public/switch-plan-button'

/**
 * Blocking notice shown in place of the checkout form when the student already
 * has a live subscription to a different plan in this school (issue #459).
 * Server component — rendered by the checkout pages before any payment UI.
 *
 * When the current subscription's provider supports an automated switch
 * (#463), this offers a self-service "Switch to this plan" CTA instead of the
 * "contact your school" dead end — cross-provider switches (and providers
 * without a change-plan path) still fall back to that copy.
 */
export async function SubscriptionConflictNotice({
  currentPlanName,
  targetPlanId,
  canSwitchPlan = false,
}: {
  currentPlanName: string | null
  targetPlanId?: number
  canSwitchPlan?: boolean
}) {
  const t = await getTranslations('checkout.conflict')
  const canSwitchHere = canSwitchPlan && typeof targetPlanId === 'number'

  return (
    <div
      className="rounded-xl border border-border bg-card px-6 py-10 text-center sm:px-10"
      data-testid="subscription-conflict-notice"
    >
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
        <IconAlertTriangle className="h-7 w-7 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {currentPlanName
          ? t('descriptionWithPlan', { planName: currentPlanName })
          : t('description')}
      </p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {canSwitchHere ? t('howToSwitchSelfService') : t('howToSwitch')}
      </p>
      <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {canSwitchHere ? (
          <SwitchPlanButton planId={targetPlanId} />
        ) : (
          <Link href="/dashboard/student/billing">
            <Button>{t('viewBilling')}</Button>
          </Link>
        )}
        <Link href="/dashboard/student/browse">
          <Button variant="outline">{t('browseCourses')}</Button>
        </Link>
      </div>
    </div>
  )
}
