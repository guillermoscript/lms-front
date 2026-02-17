'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UsageMeter } from './usage-meter'
import { IconCreditCard, IconCalendar } from '@tabler/icons-react'
import Link from 'next/link'

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
    currentPeriodEnd: string | null
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
  const isFree = plan === 'free'
  const periodEnd = billingPeriodEnd ? new Date(billingPeriodEnd) : null

  return (
    <div className="space-y-6">
      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Current Plan
                <Badge variant={isFree ? 'secondary' : 'default'}>{planName}</Badge>
              </CardTitle>
              <CardDescription>
                {isFree
                  ? 'You are on the free plan. Upgrade to unlock more features.'
                  : `${transactionFeePercent}% transaction fee on student payments`
                }
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!isFree && onManageClick && (
                <Button variant="outline" size="sm" onClick={onManageClick}>
                  <IconCreditCard className="mr-2 h-4 w-4" />
                  Manage
                </Button>
              )}
              <Link href="/dashboard/admin/billing/upgrade">
                <Button size="sm">
                  {isFree ? 'Upgrade' : 'Change Plan'}
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Billing period */}
          {!isFree && periodEnd && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <IconCalendar className="h-4 w-4" />
              {subscription?.cancelAtPeriodEnd ? (
                <span className="text-yellow-600 dark:text-yellow-500">
                  Cancels on {periodEnd.toLocaleDateString()}
                </span>
              ) : (
                <span>Next billing date: {periodEnd.toLocaleDateString()}</span>
              )}
              {subscription && (
                <Badge variant="outline" className="ml-2">
                  {subscription.interval === 'yearly' ? 'Annual' : 'Monthly'}
                </Badge>
              )}
            </div>
          )}

          {billingStatus === 'past_due' && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Your payment is past due. Please update your payment method to avoid service interruption.
            </div>
          )}

          {/* Usage Meters */}
          <div className="grid gap-4 md:grid-cols-2">
            <UsageMeter
              label="Courses"
              current={usage.courses.current}
              limit={usage.courses.limit}
            />
            <UsageMeter
              label="Students"
              current={usage.students.current}
              limit={usage.students.limit}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
