'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { IconCheck, IconMinus, IconSparkles } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

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
  onSelectPlan?: (planId: string, interval: 'monthly' | 'yearly') => void
  onManualTransfer?: (planId: string, interval: 'monthly' | 'yearly') => void
  loading?: boolean
  showActions?: boolean
}

const FEATURE_LABELS: Record<string, string> = {
  xp: 'XP & Levels',
  levels: 'Level System',
  streaks: 'Streaks',
  leaderboard: 'Leaderboard',
  achievements: 'Achievements',
  store: 'Point Store',
  certificates: 'Certificates',
  analytics: 'Analytics',
  ai_grading: 'AI Auto-Grading',
  custom_branding: 'Custom Branding',
  custom_domain: 'Custom Domain',
  api_access: 'API Access',
  white_label: 'White-Label',
  priority_support: 'Priority Support',
}

const FEATURE_KEYS = Object.keys(FEATURE_LABELS)

function isIncluded(value: boolean | string | undefined) {
  return value === true || (typeof value === 'string' && value !== 'false')
}

function formatLimit(value: number) {
  return value === -1 ? 'Unlimited' : value.toLocaleString()
}

function FeatureValue({ value }: { value: boolean | string | undefined }) {
  if (!isIncluded(value)) {
    return <IconMinus aria-label="Not included" className="mx-auto size-4 text-muted-foreground/50" />
  }

  if (typeof value === 'string' && value !== 'true') {
    return <span className="text-xs font-medium">{value}</span>
  }

  return <IconCheck aria-label="Included" className="mx-auto size-4 text-primary" strokeWidth={2.5} />
}

export function PlanComparisonTable({
  plans,
  currentPlan = 'free',
  onSelectPlan,
  onManualTransfer,
  loading = false,
  showActions = true,
}: PlanComparisonTableProps) {
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly')
  const yearly = interval === 'yearly'
  const featureKeys = useMemo(
    () => FEATURE_KEYS.filter((key) => plans.some((plan) => plan.features[key] !== undefined)),
    [plans],
  )

  return (
    <div className="space-y-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          role="group"
          aria-label="Billing interval"
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
            Monthly
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
            Yearly
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-semibold text-primary">
              Save ~17%
            </Badge>
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {yearly ? 'Billed once per year. Cancel at the end of your billing period.' : 'Billed monthly. Change plans when your school needs more room.'}
        </p>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlan
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
              )}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-5 gap-1.5 shadow-sm">
                  <IconSparkles className="size-3" />
                  Most popular
                </Badge>
              )}
              <CardHeader className="gap-5 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <p className="min-h-10 text-sm leading-5 text-muted-foreground">{plan.description}</p>
                  </div>
                  {isCurrent && <Badge variant="secondary">Current plan</Badge>}
                </div>

                <div>
                  {plan.slug === 'free' ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-semibold tracking-tight">$0</span>
                      <span className="text-sm text-muted-foreground">forever</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-tight">${monthlyEquivalent}</span>
                        <span className="text-sm text-muted-foreground">/ month</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {yearly ? `$${price} billed yearly` : 'Billed monthly'}
                      </p>
                    </>
                  )}
                </div>

                <dl className="grid grid-cols-3 divide-x rounded-lg border bg-muted/25 text-center">
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Courses</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{formatLimit(plan.limits.max_courses)}</dd>
                  </div>
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Students</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{formatLimit(plan.limits.max_students)}</dd>
                  </div>
                  <div className="px-2 py-2.5">
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Platform fee</dt>
                    <dd className="mt-1 text-sm font-semibold tabular-nums">{plan.transaction_fee_percent}%</dd>
                  </div>
                </dl>
              </CardHeader>

              <CardContent className="flex-1 pt-2">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</p>
                <ul className="space-y-2.5">
                  {visibleFeatures.map((key) => (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <IconCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
                      <span>{FEATURE_LABELS[key]}</span>
                    </li>
                  ))}
                  {remainingFeatureCount > 0 && (
                    <li className="pl-6 text-sm text-muted-foreground">+ {remainingFeatureCount} more in full comparison</li>
                  )}
                </ul>
              </CardContent>

              {showActions && (
                <CardFooter className="flex flex-col gap-2 pt-2">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>Current plan</Button>
                  ) : plan.slug === 'free' ? (
                    <Button variant="ghost" className="w-full" disabled>Free plan</Button>
                  ) : (
                    <>
                      <Button className="w-full" onClick={() => onSelectPlan?.(plan.plan_id, interval)} disabled={loading}>
                        {loading ? 'Opening checkout...' : 'Choose plan'}
                      </Button>
                      {onManualTransfer && (
                        <Button variant="ghost" size="sm" className="w-full" onClick={() => onManualTransfer(plan.plan_id, interval)} disabled={loading}>
                          Pay via bank transfer
                        </Button>
                      )}
                    </>
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
            <h2 id="plan-comparison-heading" className="font-semibold">Compare every feature</h2>
            <p className="mt-1 text-sm text-muted-foreground">See exactly what your school gets at each level.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-muted/20">
                <tr className="border-b">
                  <th scope="col" className="w-48 px-5 py-3 text-left text-xs font-medium text-muted-foreground">Feature</th>
                  {plans.map((plan) => <th key={plan.plan_id} scope="col" className="px-4 py-3 text-center text-xs font-semibold">{plan.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {featureKeys.map((key) => (
                  <tr key={key} className="hover:bg-muted/20">
                    <th scope="row" className="px-5 py-3 text-left font-medium">{FEATURE_LABELS[key]}</th>
                    {plans.map((plan) => (
                      <td key={plan.plan_id} className="px-4 py-3 text-center"><FeatureValue value={plan.features[key]} /></td>
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
