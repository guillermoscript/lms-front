'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlanComparisonTable } from '@/components/admin/plan-comparison-table'
import { ManualTransferForm } from '@/components/admin/manual-transfer-form'
import { PlanChangeDialog, type PlanChangeTarget } from '@/components/admin/plan-change-dialog'
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
  /** Tenant already has an active Stripe subscription → in-app change flow. */
  activeStripeSub?: boolean
  currentInterval?: 'monthly' | 'yearly'
}

export function UpgradePageClient({ plans, currentPlan, preselectedPlan, preselectedInterval, activeStripeSub = false, currentInterval }: UpgradePageClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('dashboard.admin.billing.upgrade')
  const [loading, setLoading] = useState(false)
  const [planChange, setPlanChange] = useState<PlanChangeTarget | null>(null)
  const [manualTransfer, setManualTransfer] = useState<{
    planId: string
    planName: string
    amount: number
    interval: 'monthly' | 'yearly'
  } | null>(null)

  const handleSelectPlan = async (planId: string, interval: 'monthly' | 'yearly') => {
    // Existing Stripe subscribers change plans in-app (Stripe subscription
    // update + proration preview) rather than starting a fresh checkout.
    if (activeStripeSub) {
      const plan = plans.find((p) => p.plan_id === planId)
      if (!plan) return
      const currentIndex = plans.findIndex((p) => p.slug === currentPlan)
      const targetIndex = plans.findIndex((p) => p.plan_id === planId)
      const direction =
        plan.slug === currentPlan
          ? 'interval'
          : targetIndex > currentIndex
            ? 'upgrade'
            : 'downgrade'
      setPlanChange({ planId, planName: plan.name, interval, direction })
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval, locale }),
      })
      const data = await response.json()
      if (data.url) {
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

  const handleManualTransfer = (planId: string, interval: 'monthly' | 'yearly') => {
    const plan = plans.find((p) => p.plan_id === planId)
    if (!plan) return

    setManualTransfer({
      planId,
      planName: plan.name,
      amount: interval === 'yearly' ? plan.price_yearly : plan.price_monthly,
      interval,
    })
  }

  const handleManualSubmit = async (bankReference: string, notes: string) => {
    if (!manualTransfer) return
    try {
      await requestManualPlanUpgrade(manualTransfer.planId, manualTransfer.interval, bankReference, notes)
    } catch (e: any) {
      toast.error(e.message || t('submitError'))
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
        onSelectPlan={handleSelectPlan}
        onManualTransfer={activeStripeSub ? undefined : handleManualTransfer}
        loading={loading}
        existingSubscriber={activeStripeSub}
        currentInterval={currentInterval}
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
