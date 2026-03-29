'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BillingOverview } from '@/components/admin/billing-overview'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProofUpload } from '@/components/shared/proof-upload'
import { IconExternalLink, IconRefresh, IconCreditCard, IconPhoto, IconClock } from '@tabler/icons-react'
import { uploadPaymentProof, requestManualRenewal } from '@/app/actions/admin/billing'

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
      currentPeriodStart: string | null
      currentPeriodEnd: string | null
      gracePeriodEnd: string | null
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
    proof_url?: string | null
    platform_plans: { name: string; slug: string } | null
  }>
}

export function BillingDashboardClient({ status, paymentRequests }: BillingDashboardClientProps) {
  const router = useRouter()
  const [portalLoading, setPortalLoading] = useState(false)
  const [renewalLoading, setRenewalLoading] = useState(false)
  const [switchLoading, setSwitchLoading] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)

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

  const handleRenewal = async () => {
    setRenewalLoading(true)
    try {
      await requestManualRenewal()
      toast.success('Renewal request submitted')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setRenewalLoading(false)
    }
  }

  const handleSwitchToStripe = async () => {
    if (!status.subscription) return
    setSwitchLoading(true)
    try {
      // We need the plan_id — fetch from current subscription via upgrade page
      // Navigate to upgrade page where they can select Stripe checkout
      router.push('/dashboard/admin/billing/upgrade')
    } finally {
      setSwitchLoading(false)
    }
  }

  const handleProofUpload = async (requestId: string, file: File) => {
    setUploadingFor(requestId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await uploadPaymentProof(requestId, formData)
      toast.success('Proof uploaded successfully')
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
      throw e // re-throw so ProofUpload shows error state
    } finally {
      setUploadingFor(null)
    }
  }

  const pendingRequests = paymentRequests.filter(
    (r) => !['confirmed', 'rejected', 'expired'].includes(r.status)
  )

  const isManualSub = status.subscription?.paymentMethod === 'manual_transfer'
  const periodEnd = status.subscription?.currentPeriodEnd ? new Date(status.subscription.currentPeriodEnd) : null
  const now = new Date()
  const daysUntilEnd = periodEnd ? Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
  const showRenewalSection = isManualSub && daysUntilEnd !== null && daysUntilEnd <= 30
  const hasPendingRenewal = paymentRequests.some(
    (r) => (r as any).request_type === 'renewal' && !['confirmed', 'rejected', 'expired'].includes(r.status)
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

      {/* Manual Subscription Renewal Section */}
      {showRenewalSection && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconRefresh className="h-5 w-5" />
              Subscription Renewal
            </CardTitle>
            <CardDescription>
              {daysUntilEnd! > 0
                ? `Your subscription period ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''}. Renew now to maintain uninterrupted service.`
                : 'Your subscription period has ended. Renew now to avoid being downgraded.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                onClick={handleRenewal}
                disabled={renewalLoading || hasPendingRenewal}
              >
                <IconRefresh className="mr-2 h-4 w-4" />
                {hasPendingRenewal ? 'Renewal Pending' : renewalLoading ? 'Requesting...' : 'Renew via Bank Transfer'}
              </Button>
              <Button
                variant="outline"
                onClick={handleSwitchToStripe}
                disabled={switchLoading}
              >
                <IconCreditCard className="mr-2 h-4 w-4" />
                {switchLoading ? 'Redirecting...' : 'Switch to Stripe'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Manual Transfer Requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconClock className="h-5 w-5" />
              Pending Payment Requests
            </CardTitle>
            <CardDescription>
              Your bank transfer request{pendingRequests.length > 1 ? 's are' : ' is'} in the queue — our team will review and activate your plan once payment is confirmed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.request_id}
                  className="rounded-md border p-3 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {req.platform_plans?.name || 'Unknown Plan'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        ${req.amount}/{req.interval === 'yearly' ? 'year' : 'month'} &middot; Submitted {new Date(req.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.proof_url && (
                        <a
                          href={req.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <IconPhoto className="h-3 w-3" />
                          View Proof
                        </a>
                      )}
                      <Badge variant={
                        req.status === 'pending' ? 'secondary'
                          : req.status === 'instructions_sent' ? 'outline'
                            : 'default'
                      }>
                        {req.status === 'pending' && 'Awaiting review'}
                        {req.status === 'instructions_sent' && 'Instructions sent'}
                        {req.status === 'payment_received' && 'Payment received'}
                        {!['pending', 'instructions_sent', 'payment_received'].includes(req.status) && req.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>

                  {/* Status hint */}
                  <p className="text-xs text-muted-foreground">
                    {req.status === 'pending' && 'We\'ll send bank transfer instructions to your billing email shortly.'}
                    {req.status === 'instructions_sent' && 'Check your email for bank transfer instructions. Once you\'ve transferred, upload proof below.'}
                    {req.status === 'payment_received' && 'We\'ve received your payment and are confirming it. Your plan will be activated soon.'}
                  </p>

                  {/* Proof upload for requests without proof */}
                  {!req.proof_url && (
                    <ProofUpload
                      onUpload={(file) => handleProofUpload(req.request_id, file)}
                      label="Upload payment proof (optional — speeds up activation)"
                      disabled={uploadingFor === req.request_id}
                    />
                  )}
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
