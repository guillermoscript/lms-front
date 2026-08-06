'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlanComparisonTable } from '@/components/admin/plan-comparison-table'
import { ManualTransferForm } from '@/components/admin/manual-transfer-form'
import { PlanChangeDialog, type PlanChangeTarget } from '@/components/admin/plan-change-dialog'
import {
  PaymentMethodDialog,
  type PaymentMethodTarget,
} from '@/components/admin/payment-method-dialog'
import { requestManualPlanUpgrade } from '@/app/actions/admin/billing'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'

interface UpgradePageClientProps {
  plans: Array<{
    plan_id: string
    slug: string
    name: string
    description: string
    price_monthly: number
    price_yearly: number
    transaction_fee_percent: number
    features: Record<string, boolean | string>
    limits: { max_courses: number; max_students: number }
  }>
  currentPlan: string
  preselectedPlan?: string
  preselectedInterval?: 'monthly' | 'yearly'
  /**
   * Providers with an active `platform_plan_prices` row, keyed by plan id then
   * interval. This is what makes the payment-method step real rather than a
   * hardcoded pair (#603) — a provider a super admin has not priced simply is
   * not offered.
   */
  planProviders: Record<string, { monthly: string[]; yearly: string[] }>
  /**
   * The provider the school's live subscription is on (`null` when it has
   * none). Replaces the old boolean `activeStripeSub`: the question was never
   * "is this Stripe" but "which rail is this school on, and can that rail swap
   * plans in place".
   */
  activeSubscriptionProvider?: string | null
  /** The live provider can change plan in place (proration), rather than re-checkout. */
  canChangePlanInPlace?: boolean
  currentInterval?: 'monthly' | 'yearly'
}

export function UpgradePageClient({
  plans,
  currentPlan,
  preselectedPlan,
  preselectedInterval,
  planProviders,
  activeSubscriptionProvider = null,
  canChangePlanInPlace = false,
  currentInterval,
}: UpgradePageClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('dashboard.admin.billing.upgrade')
  const [loading, setLoading] = useState(false)
  const [planChange, setPlanChange] = useState<PlanChangeTarget | null>(null)
  const [methodTarget, setMethodTarget] = useState<PaymentMethodTarget | null>(null)
  const [manualTransfer, setManualTransfer] = useState<{
    planId: string
    planName: string
    amount: number
    interval: 'monthly' | 'yearly'
  } | null>(null)

  // Choosing a plan never starts a payment any more — it asks how the school
  // wants to pay first. That step is what makes a provider switch possible in
  // both directions; the old flow branched straight to Stripe and dropped the
  // bank-transfer option precisely when a failing card made it necessary.
  const handleChoosePlan = (planId: string, interval: 'monthly' | 'yearly') => {
    const plan = plans.find((p) => p.plan_id === planId)
    if (!plan) return
    setMethodTarget({
      planId,
      planName: plan.name,
      interval,
      providers: planProviders[planId]?.[interval] ?? [],
    })
  }

  const handleSelectProvider = async (provider: string) => {
    if (!methodTarget) return
    const { planId, planName, interval } = methodTarget

    // Staying on the same rail with a live subscription is a plan change, not a
    // second checkout: the provider swaps the price on the existing
    // subscription with proration. Starting a checkout here would leave the
    // school paying for two subscriptions at once.
    if (provider === activeSubscriptionProvider && canChangePlanInPlace) {
      const currentIndex = plans.findIndex((p) => p.slug === currentPlan)
      const targetIndex = plans.findIndex((p) => p.plan_id === planId)
      const plan = plans.find((p) => p.plan_id === planId)
      const direction =
        plan?.slug === currentPlan ? 'interval' : targetIndex > currentIndex ? 'upgrade' : 'downgrade'
      setMethodTarget(null)
      setPlanChange({ planId, planName, interval, direction })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval, provider, locale }),
      })
      const data = await response.json()
      // Not every rail is a redirect (#610). A Solana checkout hands back a
      // `solana:` transaction-request URL, which is a QR to be scanned and
      // polled, not an address a desktop browser can navigate to — sending the
      // admin there would dead-end them on an unhandled protocol.
      if (data.kind === 'qr' && data.requestId) {
        router.push(`/${locale}/dashboard/admin/billing/checkout/${data.requestId}`)
      } else if (data.url) {
        window.location.href = data.url
      } else {
        toast.error(data.error || t('checkoutError'))
      }
    } catch (error) {
      console.error('Checkout error:', error)
      toast.error(t('checkoutFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleSelectManual = () => {
    if (!methodTarget) return
    const plan = plans.find((p) => p.plan_id === methodTarget.planId)
    if (!plan) return

    setManualTransfer({
      planId: methodTarget.planId,
      planName: plan.name,
      amount: methodTarget.interval === 'yearly' ? plan.price_yearly : plan.price_monthly,
      interval: methodTarget.interval,
    })
    setMethodTarget(null)
  }

  const handleManualSubmit = async (bankReference: string, notes: string) => {
    if (!manualTransfer) return
    try {
      await requestManualPlanUpgrade(
        manualTransfer.planId,
        manualTransfer.interval,
        bankReference,
        notes,
        'manual',
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('submitError'))
    }
  }

  const navigateToBilling = () => {
    router.push(`/${locale}/dashboard/admin/billing`)
  }

  if (manualTransfer) {
    return (
      <ManualTransferForm
        planName={manualTransfer.planName}
        amount={manualTransfer.amount}
        interval={manualTransfer.interval}
        onSubmit={handleManualSubmit}
        onSuccess={navigateToBilling}
        onCancel={() => setManualTransfer(null)}
      />
    )
  }

  return (
    <>
      <PlanComparisonTable
        plans={plans}
        currentPlan={currentPlan}
        preselectedPlan={preselectedPlan}
        initialInterval={preselectedInterval}
        onChoosePlan={handleChoosePlan}
        loading={loading}
        existingSubscriber={!!activeSubscriptionProvider}
        currentInterval={currentInterval}
      />
      <PaymentMethodDialog
        open={methodTarget !== null}
        onOpenChange={(open) => {
          if (!open) setMethodTarget(null)
        }}
        target={methodTarget}
        activeProvider={activeSubscriptionProvider}
        loading={loading}
        onSelectProvider={handleSelectProvider}
        onSelectManual={handleSelectManual}
      />
      <PlanChangeDialog
        open={planChange !== null}
        onOpenChange={(open) => {
          if (!open) setPlanChange(null)
        }}
        target={planChange}
        onConfirmed={navigateToBilling}
      />
    </>
  )
}
