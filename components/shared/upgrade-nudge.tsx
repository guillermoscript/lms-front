'use client'

import { useTranslations } from 'next-intl'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconLock } from '@tabler/icons-react'
import Link from 'next/link'
import { FEATURE_REQUIRED_PLAN, PLAN_FEATURE_LABELS, PLAN_PRICES, type PlanFeatures } from '@/lib/plans/features'

/**
 * Extra one-line explanation for tiered features, keyed into
 * `featureGate.*` — e.g. what "basic" analytics leaves out.
 */
export type UpgradeNudgeHint = 'analyticsBasic' | 'certificatesBasic' | 'brandingLocked'

interface UpgradeNudgeProps {
  feature: keyof PlanFeatures | string
  currentPlan?: string
  className?: string
  compact?: boolean
  hint?: UpgradeNudgeHint
}

function titleCase(slug: string) {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

/**
 * The upgrade prompt shown wherever a server gate (lib/plans/server.ts) said
 * no. Required plan and price come from lib/plans/features so this can never
 * promise a different plan than the pricing page; copy comes from
 * `featureGate.*` in messages/*.json (issue #662 — it used to be hardcoded
 * English).
 */
export function UpgradeNudge({ feature, currentPlan, className, compact, hint }: UpgradeNudgeProps) {
  const t = useTranslations('featureGate')
  const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || 'starter'
  const featureName = t.has(`features.${feature}`)
    ? t(`features.${feature}`)
    : PLAN_FEATURE_LABELS[feature] || feature
  const price = PLAN_PRICES[requiredPlan] ?? 9
  const planLabel = titleCase(requiredPlan)

  if (compact) {
    return (
      <div
        className={`flex flex-wrap items-center gap-2 text-sm text-muted-foreground ${className || ''}`}
        data-testid="upgrade-nudge"
        data-feature={feature}
      >
        <IconLock className="h-4 w-4 shrink-0" aria-hidden />
        <span>{t('upgradeToUnlock', { plan: planLabel, feature: featureName })}</span>
        {hint && <span className="text-xs">{t(hint)}</span>}
        <Link href="/dashboard/admin/billing/upgrade">
          <Button variant="link" size="sm" className="h-auto p-0">
            {t('upgrade', { plan: planLabel })}
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <Card className={className} data-testid="upgrade-nudge" data-feature={feature}>
      <CardContent className="flex flex-col items-center gap-4 py-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <IconLock className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <div className="max-w-md text-center">
          <h3 className="font-semibold">{featureName}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('locked', { plan: planLabel })}
            {currentPlan && currentPlan !== requiredPlan && ` (${t('youAreOn', { plan: currentPlan })})`}
          </p>
          {hint && <p className="mt-2 text-sm text-muted-foreground">{t(hint)}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{t('startingAt', { price })}</p>
        </div>
        <Link href="/dashboard/admin/billing/upgrade">
          <Button>{t('upgrade', { plan: planLabel })}</Button>
        </Link>
      </CardContent>
    </Card>
  )
}
