'use client'

import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { IconCheck, IconMinus, IconSparkles } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { PLAN_FEATURE_KEYS } from '@/lib/plans/features'

interface PlanData {
  plan_id: string
  slug: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  transaction_fee_percent: number
  features: Record<string, boolean | string>
  limits: { max_courses: number; max_students: number }
}

interface PlanComparisonTableProps {
  plans: PlanData[]
  currentPlan?: string
  /**
   * The school picked this plan. WHICH payment method it pays with is a separate
   * step the caller owns — this component no longer decides, because it used to
   * decide by hardcoding one button for Stripe and one for a bank wire, which
   * made every other configured provider unreachable (#603).
   */
  onChoosePlan?: (planId: string, interval: 'monthly' | 'yearly') => void
  loading?: boolean
  showActions?: boolean
  preselectedPlan?: string
  initialInterval?: 'monthly' | 'yearly'
  /**
   * When true, the tenant already has a live subscription with a provider that
   * can swap plans in place. CTAs become direction-aware (Upgrade / Downgrade /
   * Switch interval) and route through an in-app subscription update rather than
   * a fresh checkout.
   */
  existingSubscriber?: boolean
  /** The tenant's current billing interval — enables same-plan interval switches. */
  currentInterval?: 'monthly' | 'yearly'
}

// Gamification basics first, then the canonical gated list (#662). The labels
// themselves live in `dashboard.admin.billing.planComparison.features` so this
// screen reads in the school's language (#726).
const FEATURE_KEYS = ['xp', 'levels', 'streaks', ...PLAN_FEATURE_KEYS]

function isIncluded(value: boolean | string | undefined) {
  return value === true || (typeof value === 'string' && value !== 'false')
}

function FeatureValue({
  value,
  includedLabel,
  notIncludedLabel,
}: {
  value: boolean | string | undefined
  includedLabel: string
  notIncludedLabel: string
}) {
  if (!isIncluded(value)) {
    return <IconMinus aria-label={notIncludedLabel} className="mx-auto size-4 text-muted-foreground/50" />
  }

  if (typeof value === 'string' && value !== 'true') {
    return <span className="text-xs font-medium">{value}</span>
  }

  return <IconCheck aria-label={includedLabel} className="mx-auto size-4 text-primary" strokeWidth={2.5} />
}

export function PlanComparisonTable({
  plans,
  currentPlan = 'free',
  onChoosePlan,
  loading = false,
  showActions = true,
  preselectedPlan,
  initialInterval,
  existingSubscriber = false,
  currentInterval,
}: PlanComparisonTableProps) {
  const t = useTranslations('dashboard.admin.billing.planComparison')
  const locale = useLocale()
  // Locale-less `toLocaleString()` formatted on the server in one locale and in
  // the browser in another, which is a hydration mismatch (#726).
  const formatLimit = (value: number) =>
    value === -1 ? t('unlimited') : new Intl.NumberFormat(locale).format(value)
  const featureLabel = (key: string) => t(`features.${key}` as Parameters<typeof t>[0])
  const [interval, setInterval] = useState<'monthly' | 'yearly'>(initialInterval ?? 'monthly')
  const yearly = interval === 'yearly'
  const featureKeys = useMemo(
    () => FEATURE_KEYS.filter((key) => plans.some((plan) => plan.features[key] !== undefined)),
    [plans],
  )
  const currentIndex = plans.findIndex((p) => p.slug === currentPlan)

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          role="group"
          aria-label={t('intervalGroupLabel')}
          className="inline-flex rounded-lg border bg-muted/45 p-1"
        >
          <button
            type="button"
            aria-pressed={!yearly}
            onClick={() => setInterval('monthly')}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !yearly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('monthly')}
          </button>
          <button
            type="button"
            aria-pressed={yearly}
            onClick={() => setInterval('yearly')}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              yearly ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('yearly')}
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold text-primary">
              {t('yearlySaving')}
            </Badge>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {yearly ? t('billedYearlyNote') : t('billedMonthlyNote')}
        </p>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan, planIndex) => {
          const isCurrent = plan.slug === currentPlan
          const isPreselected = !isCurrent && plan.slug === preselectedPlan
          const isPopular = plan.slug === 'pro'
          const price = yearly ? plan.price_yearly : plan.price_monthly
          const monthlyEquivalent = yearly ? Math.round(plan.price_yearly / 12) : plan.price_monthly
          const includedFeatures = featureKeys.filter((key) => isIncluded(plan.features[key]))
          const visibleFeatures = includedFeatures.slice(0, 4)
          const remainingFeatureCount = includedFeatures.length - visibleFeatures.length

          return (
            <Card
              key={plan.plan_id}
              className={cn(
                'relative flex flex-col overflow-visible',
                isPopular && 'border-primary shadow-lg shadow-primary/10',
                isCurrent && 'bg-muted/30',
                isPreselected && 'border-primary ring-2 ring-primary shadow-lg shadow-primary/15',
              )}
              data-preselected={isPreselected || undefined}
            >
              {isPreselected && (
                <Badge className="absolute -top-3 right-5 shadow-sm">{t('yourSelection')}</Badge>
              )}
              {isPopular && (
                <Badge className="absolute -top-3 left-5 gap-1.5 shadow-sm">
                  <IconSparkles className="size-3" />
                  {t('mostPopular')}
                </Badge>
              )}
              <CardHeader className="gap-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <p className="min-h-10 text-sm leading-5 text-muted-foreground">{plan.description}</p>
                  </div>
                  {isCurrent && <Badge variant="secondary">{t('currentPlan')}</Badge>}
                </div>

                <div>
                  {plan.slug === 'free' ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight">$0</span>
                      <span className="text-sm text-muted-foreground">{t('forever')}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-tight">${monthlyEquivalent}</span>
                        <span className="text-sm text-muted-foreground">{t('perMonth')}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {yearly ? t('billedYearly', { price }) : t('billedMonthly')}
                      </p>
                    </>
                  )}
                </div>

                <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/25 text-center">
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('courses')}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{formatLimit(plan.limits.max_courses)}</dd>
                  </div>
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('students')}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{formatLimit(plan.limits.max_students)}</dd>
                  </div>
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t('platformFee')}</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{plan.transaction_fee_percent}%</dd>
                  </div>
                </dl>
              </CardHeader>

              <CardContent className="flex-1 pt-2">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('highlights')}</p>
                <ul className="space-y-2.5">
                  {visibleFeatures.map((key) => (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                      <span>{featureLabel(key)}</span>
                    </li>
                  ))}
                  {remainingFeatureCount > 0 && (
                    <li className="pl-6 text-sm text-muted-foreground">{t('moreInComparison', { count: remainingFeatureCount })}</li>
                  )}
                </ul>
              </CardContent>

              {showActions && (
                <CardFooter className="flex flex-col gap-2 pt-2">
                  {existingSubscriber ? (
                    isCurrent ? (
                      currentInterval && interval !== currentInterval ? (
                        <Button className="w-full" onClick={() => onChoosePlan?.(plan.plan_id, interval)} disabled={loading}>
                          {interval === 'yearly' ? t('switchToYearly') : t('switchToMonthly')}
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" className="w-full" disabled>{t('currentPlan')}</Button>
                          {/*
                            The only route to a different payment method for a
                            school staying on its current plan. Without it, a
                            school whose card starts failing has nothing to
                            click: every other CTA on this screen is a plan
                            change (#603).
                          */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => onChoosePlan?.(plan.plan_id, interval)}
                            disabled={loading}
                          >
                            {t('changePaymentMethod')}
                          </Button>
                        </>
                      )
                    ) : plan.slug === 'free' ? (
                      <Button variant="ghost" className="w-full" disabled>{t('cancelToDowngrade')}</Button>
                    ) : (
                      <Button className="w-full" onClick={() => onChoosePlan?.(plan.plan_id, interval)} disabled={loading}>
                        {planIndex > currentIndex ? t('upgradeToPlan') : t('downgradeToPlan')}
                      </Button>
                    )
                  ) : isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>{t('currentPlan')}</Button>
                  ) : plan.slug === 'free' ? (
                    <Button variant="ghost" className="w-full" disabled>{t('freePlan')}</Button>
                  ) : (
                    <Button className="w-full" onClick={() => onChoosePlan?.(plan.plan_id, interval)} disabled={loading}>
                      {loading ? t('openingCheckout') : t('choosePlan')}
                    </Button>
                  )}
                </CardFooter>
              )}
            </Card>
          )
        })}
      </div>

      {featureKeys.length > 0 && (
        <section aria-labelledby="plan-comparison-heading" className="overflow-hidden rounded-xl border">
          <div className="border-b bg-muted/30 px-5 py-4">
            <h2 id="plan-comparison-heading" className="font-semibold">{t('compareTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('compareSubtitle')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-muted/20">
                <tr className="border-b">
                  <th scope="col" className="w-48 px-5 py-3 text-left text-xs font-medium text-muted-foreground">{t('featureColumn')}</th>
                  {plans.map((plan) => <th key={plan.plan_id} scope="col" className="px-4 py-3 text-center text-xs font-semibold">{plan.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {featureKeys.map((key) => (
                  <tr key={key} className="hover:bg-muted/20">
                    <th scope="row" className="px-5 py-3 text-left font-medium">{featureLabel(key)}</th>
                    {plans.map((plan) => (
                      <td key={plan.plan_id} className="px-4 py-3 text-center"><FeatureValue value={plan.features[key]} includedLabel={t('included')} notIncludedLabel={t('notIncluded')} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
