'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PlanComparisonTable } from '@/components/admin/plan-comparison-table'
import { ManualTransferForm } from '@/components/admin/manual-transfer-form'
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
}

export function UpgradePageClient({ plans, currentPlan }: UpgradePageClientProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('dashboard.admin.billing.upgrade')
  const [loading, setLoading] = useState(false)
  const [manualSubmitted, setManualSubmitted] = useState(false)
  const [manualTransfer, setManualTransfer] = useState<{
    planId: string
    planName: string
    amount: number
    interval: 'monthly' | 'yearly'
  } | null>(null)

  const handleSelectPlan = async (planId: string, interval: 'monthly' | 'yearly') => {
    setLoading(true)
    try {
      const response = await fetch('/api/stripe/checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval }),
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
      setManualSubmitted(true)
    } catch (e: any) {
      toast.error(e.message || t('submitError'))
      throw e
    }
  }

  if (manualTransfer) {
    return (
      <ManualTransferForm
        planName={manualTransfer.planName}
        amount={manualTransfer.amount}
        interval={manualTransfer.interval}
        onSubmit={handleManualSubmit}
        onCancel={() => {
          if (manualSubmitted) {
            router.push(`/${locale}/dashboard/admin/billing`)
          } else {
            setManualTransfer(null)
          }
        }}
      />
    )
  }

  return (
    <PlanComparisonTable
      plans={plans}
      currentPlan={currentPlan}
      onSelectPlan={handleSelectPlan}
      onManualTransfer={handleManualTransfer}
      loading={loading}
    />
  )
}
