'use client'

import { type ReactNode } from 'react'
import { canAccessFeature, type PlanFeatures } from '@/lib/plans/features'
import { UpgradeNudge } from './upgrade-nudge'

interface FeatureGateProps {
  feature: keyof PlanFeatures
  plan: string
  features: Partial<PlanFeatures>
  children: ReactNode
  /** If provided, shows a custom fallback instead of the default UpgradeNudge */
  fallback?: ReactNode
}

export function FeatureGate({ feature, plan, features, children, fallback }: FeatureGateProps) {
  if (canAccessFeature(features, feature)) {
    return <>{children}</>
  }

  if (fallback) {
    return <>{fallback}</>
  }

  return <UpgradeNudge feature={feature} currentPlan={plan} />
}
