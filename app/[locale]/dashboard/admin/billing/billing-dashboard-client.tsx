'use client'

import { useState } from 'react'
import { BillingOverview } from '@/components/admin/billing-overview'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { IconExternalLink } from '@tabler/icons-react'

interface BillingDashboardClientProps {
  status: {
    plan: string
    planName: string
    billingStatus: string
    billingPeriodEnd: string | null
    billingEmail: string | null
    hasStripeCustomer: boolean
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
    features: Record<string, unknown>
    transactionFeePercent: number
  }
  paymentRequests: Array<{
    request_id: string
    status: string
    amount: number
    currency: string
    interval: string
    created_at: string
    platform_plans: { name: string; slug: string } | null
  }>
}

export function BillingDashboardClient({ status, paymentRequests }: BillingDashboardClientProps) {
  const [portalLoading, setPortalLoading] = useState(false)

  const handleManageBilling = async () => {
    setPortalLoading(true)
    try {
      const response = await fetch('/api/stripe/billing-portal', { method: 'POST' })
      const data = await response.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (error) {
      console.error('Failed to open billing portal:', error)
    } finally {
      setPortalLoading(false)
    }
  }

  const pendingRequests = paymentRequests.filter(
    (r) => !['confirmed', 'rejected', 'expired'].includes(r.status)
  )

  return (
    <div className="space-y-6">
      <BillingOverview
        plan={status.plan}
        planName={status.planName}
        billingStatus={status.billingStatus}
        billingPeriodEnd={status.billingPeriodEnd}
        subscription={status.subscription}
        usage={status.usage}
        transactionFeePercent={status.transactionFeePercent}
        onManageClick={status.hasStripeCustomer ? handleManageBilling : undefined}
      />

      {/* Pending Manual Transfer Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Upgrade Requests</CardTitle>
            <CardDescription>Bank transfer requests awaiting confirmation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.request_id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {req.platform_plans?.name || 'Unknown Plan'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${req.amount}/{req.interval === 'yearly' ? 'year' : 'month'} &middot;{' '}
                      {new Date(req.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={
                    req.status === 'pending' ? 'secondary'
                      : req.status === 'instructions_sent' ? 'outline'
                      : 'default'
                  }>
                    {req.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      {status.hasStripeCustomer && (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleManageBilling} disabled={portalLoading}>
            <IconExternalLink className="mr-2 h-4 w-4" />
            {portalLoading ? 'Opening...' : 'View Invoices'}
          </Button>
        </div>
      )}
    </div>
  )
}
