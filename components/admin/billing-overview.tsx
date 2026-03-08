'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UsageMeter } from './usage-meter'
import { IconCreditCard, IconCalendar, IconAlertTriangle } from '@tabler/icons-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface BillingOverviewProps {
  plan: string
  planName: string
  billingStatus: string
  billingPeriodEnd: string | null
  subscription: {
    status: string
    paymentMethod: string
    interval: string
    cancelAtPeriodEnd: boolean
    currentPeriodStart: string | null
    currentPeriodEnd: string | null
    gracePeriodEnd: string | null
  } | null
  usage: {
    courses: { current: number; limit: number }
    students: { current: number; limit: number }
  }
  transactionFeePercent: number
  onManageClick?: () => void
}

export function BillingOverview({
  plan,
  planName,
  billingStatus,
  billingPeriodEnd,
  subscription,
  usage,
  transactionFeePercent,
  onManageClick,
}: BillingOverviewProps) {
  const t = useTranslations('dashboard.admin.billing.overview')
  const isFree = plan === 'free'
  const periodStart = subscription?.currentPeriodStart ? new Date(subscription.currentPeriodStart) : null
  const periodEnd = billingPeriodEnd ? new Date(billingPeriodEnd) : null
  const gracePeriodEnd = subscription?.gracePeriodEnd ? new Date(subscription.gracePeriodEnd) : null
  const now = new Date()
  const daysUntilEnd = periodEnd ? Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  const isManualSub = subscription?.paymentMethod === 'manual_transfer'
  const isPastDue = billingStatus === 'past_due'
  const showRenewalWarning = isManualSub && !isPastDue && daysUntilEnd !== null && daysUntilEnd <= 30 && daysUntilEnd > 0
  const daysInGracePeriod = gracePeriodEnd ? Math.ceil((gracePeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {t('currentPlan')}
                <Badge variant={isFree ? 'secondary' : 'default'}>{planName}</Badge>
                {isPastDue && <Badge variant="destructive">{t('pastDue')}</Badge>}
              </CardTitle>
              <CardDescription>
                {isFree
                  ? t('freePlanDescription')
                  : t('paidPlanDescription', { fee: transactionFeePercent })
                }
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!isFree && onManageClick && (
                <Button variant="outline" size="sm" onClick={onManageClick}>
                  <IconCreditCard className="mr-2 h-4 w-4" />
                  {t('manage')}
                </Button>
              )}
              <Link href="/dashboard/admin/billing/upgrade">
                <Button size="sm">
                  {isFree ? t('upgrade') : t('changePlan')}
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Billing period */}
          {!isFree && (periodStart || periodEnd) && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {periodStart && periodEnd && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <IconCalendar className="h-4 w-4" />
                    <span>
                      {t('period', { start: periodStart.toLocaleDateString(), end: periodEnd.toLocaleDateString() })}
                    </span>
                  </div>
                )}

                {daysUntilEnd !== null && daysUntilEnd > 0 && !isPastDue && (
                  <div className="flex items-center gap-2 font-medium text-primary">
                    <IconCalendar className="h-4 w-4" />
                    <span>{t('daysUntilPayment', { count: daysUntilEnd })}</span>
                  </div>
                )}

                {subscription && (
                  <Badge variant="outline">
                    {subscription.interval === 'yearly' ? t('annualBilling') : t('monthlyBilling')}
                  </Badge>
                )}
              </div>

              {subscription?.cancelAtPeriodEnd && periodEnd && (
                <p className="text-sm text-yellow-600 dark:text-yellow-500 font-medium">
                  {t('cancelOnDate', { date: periodEnd.toLocaleDateString() })}
                </p>
              )}
            </div>
          )}

          {isPastDue && (
            <div className="flex flex-col gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-4 text-sm">
              <div className="flex items-start gap-2 text-destructive font-semibold text-base">
                <IconAlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
                <span>{t('subscriptionPastDue')}</span>
              </div>
              <p className="text-muted-foreground">
                {t('pastDueDescription')}
              </p>

              {gracePeriodEnd && (
                <div className="rounded bg-destructive/10 p-2 mt-1 border border-destructive/20">
                  <p className="text-destructive font-medium">
                    {t('gracePeriodEnds', { count: daysInGracePeriod ?? 0, date: gracePeriodEnd.toLocaleDateString() })}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Link href="/dashboard/admin/billing/upgrade">
                  <Button variant="destructive" size="sm">
                    {t('makePaymentNow')}
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {showRenewalWarning && (
            <div className="flex items-start gap-3 rounded-md bg-yellow-50 dark:bg-yellow-950 p-4 text-sm text-yellow-800 dark:text-yellow-200 border border-yellow-200 dark:border-yellow-800">
              <IconAlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">{t('renewalRequired')}</p>
                <p>
                  {t('renewalDescription', { count: daysUntilEnd ?? 0 })}
                </p>
              </div>
            </div>
          )}

          {/* Usage Meters */}
          <div className="grid gap-4 md:grid-cols-2">
            <UsageMeter
              label={t('courses')}
              current={usage.courses.current}
              limit={usage.courses.limit}
            />
            <UsageMeter
              label={t('students')}
              current={usage.students.current}
              limit={usage.students.limit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
