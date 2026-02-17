import { getSubscriptionStatus, getManualPaymentRequests } from '@/app/actions/admin/billing'
import { BillingDashboardClient } from './billing-dashboard-client'

export default async function BillingPage() {
  const [status, paymentRequests] = await Promise.all([
    getSubscriptionStatus(),
    getManualPaymentRequests(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your school&apos;s subscription and billing
        </p>
      </div>

      <BillingDashboardClient
        status={status}
        paymentRequests={paymentRequests}
      />
    </div>
  )
}
