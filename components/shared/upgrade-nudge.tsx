'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconLock } from '@tabler/icons-react'
import Link from 'next/link'
import { FEATURE_REQUIRED_PLAN, PLAN_PRICES, type PlanFeatures } from '@/lib/plans/features'

const FEATURE_DISPLAY_NAMES: Record<string, string> = {
  leaderboard: 'Leaderboard',
  achievements: 'Achievements',
  store: 'Point Store',
  certificates: 'Custom Certificates',
  analytics: 'Analytics',
  ai_grading: 'AI Auto-Grading',
  custom_branding: 'Custom Branding',
  custom_domain: 'Custom Domain',
  api_access: 'API Access',
  white_label: 'White-Label',
  priority_support: 'Priority Support',
}

interface UpgradeNudgeProps {
  feature: keyof PlanFeatures | string
  currentPlan?: string
  className?: string
  compact?: boolean
}

export function UpgradeNudge({ feature, currentPlan, className, compact }: UpgradeNudgeProps) {
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || 'starter'
  const featureName = FEATURE_DISPLAY_NAMES[feature] || feature
  const price = PLAN_PRICES[requiredPlan] || 9

  if (compact) {
    return (
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${className || ''}`}>
        <IconLock className="h-4 w-4" />
        <span>Upgrade to {requiredPlan} (${price}/mo) to unlock {featureName}</span>
        <Link href="/dashboard/admin/billing/upgrade">
          <Button variant="link" size="sm" className="h-auto p-0">Upgrade</Button>
        </Link>
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <IconLock className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold">{featureName}</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This feature requires the <strong className="capitalize">{requiredPlan}</strong> plan
            {currentPlan && currentPlan !== requiredPlan && ` (you&apos;re on ${currentPlan})`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Starting at ${price}/month
          </p>
        </div>
        <Link href="/dashboard/admin/billing/upgrade">
          <Button>
            Upgrade to {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
