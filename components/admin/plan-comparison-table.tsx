'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { IconCheck, IconX } from '@tabler/icons-react'
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

const DISPLAY_FEATURES = [
  'leaderboard', 'achievements', 'store', 'certificates', 'analytics',
  'ai_grading', 'custom_branding', 'custom_domain', 'api_access',
  'white_label', 'priority_support',
]

export function PlanComparisonTable({
  plans,
  currentPlan = 'free',
  onSelectPlan,
  onManualTransfer,
  loading,
  showActions = true,
}: PlanComparisonTableProps) {
  const [yearly, setYearly] = useState(false)

  return (
    <div className="space-y-6">
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3">
        <Label htmlFor="billing-toggle" className={cn(!yearly && 'font-semibold')}>Monthly</Label>
        <Switch id="billing-toggle" checked={yearly} onCheckedChange={setYearly} />
        <Label htmlFor="billing-toggle" className={cn(yearly && 'font-semibold')}>
          Yearly <Badge variant="secondary" className="ml-1">Save ~17%</Badge>
        </Label>
      </div>

      {/* Plan cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        {plans.map((plan) => {
          const isCurrent = plan.slug === currentPlan
          const isPopular = plan.slug === 'pro'
          const price = yearly ? plan.price_yearly : plan.price_monthly
          const interval = yearly ? 'yearly' : 'monthly'

          return (
            <Card key={plan.plan_id} className={cn(
              'relative flex flex-col',
              isPopular && 'border-primary shadow-md',
              isCurrent && 'bg-muted/50'
            )}>
              {isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge>Most Popular</Badge>
                </div>
              )}
              <CardHeader className="text-center">
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription className="min-h-[2.5rem]">{plan.description}</CardDescription>
                <div className="pt-2">
                  {plan.slug === 'free' ? (
                    <span className="text-3xl font-bold">$0</span>
                  ) : (
                    <>
                      <span className="text-3xl font-bold">${yearly ? Math.round(plan.price_yearly / 12) : plan.price_monthly}</span>
                      <span className="text-muted-foreground">/mo</span>
                      {yearly && (
                        <div className="text-xs text-muted-foreground mt-1">
                          ${plan.price_yearly}/year billed annually
                        </div>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {/* Limits */}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Courses</span>
                    <span className="font-medium">
                      {plan.limits.max_courses === -1 ? 'Unlimited' : plan.limits.max_courses}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Students</span>
                    <span className="font-medium">
                      {plan.limits.max_students === -1 ? 'Unlimited' : plan.limits.max_students}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Transaction fee</span>
                    <span className="font-medium">
                      {plan.transaction_fee_percent === 0 ? '0%' : `${plan.transaction_fee_percent}%`}
                    </span>
                  </div>
                </div>

                <div className="border-t pt-3" />

                {/* Features */}
                <div className="space-y-2 text-sm">
                  {DISPLAY_FEATURES.map((featureKey) => {
                    const value = plan.features[featureKey]
                    const hasFeature = value === true || (typeof value === 'string' && value !== 'false')

                    return (
                      <div key={featureKey} className="flex items-center gap-2">
                        {hasFeature ? (
                          <IconCheck className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <IconX className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className={cn(!hasFeature && 'text-muted-foreground/60')}>
                          {FEATURE_LABELS[featureKey] || featureKey}
                          {typeof value === 'string' && value !== 'true' && value !== 'false' && (
                            <span className="text-xs text-muted-foreground ml-1">({value})</span>
                          )}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>

              {showActions && (
                <CardFooter className="flex flex-col gap-2">
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : plan.slug === 'free' ? (
                    <Button variant="ghost" className="w-full" disabled>
                      Free
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="w-full"
                        onClick={() => onSelectPlan?.(plan.plan_id, interval)}
                        disabled={loading}
                      >
                        {loading ? 'Loading...' : 'Subscribe'}
                      </Button>
                      {onManualTransfer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => onManualTransfer(plan.plan_id, interval)}
                          disabled={loading}
                        >
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
    </div>
  )
}
