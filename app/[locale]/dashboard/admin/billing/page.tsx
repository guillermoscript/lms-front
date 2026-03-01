import { getSubscriptionStatus, getManualPaymentRequests } from '@/app/actions/admin/billing'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { BillingDashboardClient } from './billing-dashboard-client'

export default async function BillingPage() {
  const t = await getTranslations('dashboard.admin')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const [status, paymentRequests] = await Promise.all([
    getSubscriptionStatus(),
    getManualPaymentRequests(),
  ])

  return (
    <div className="space-y-6 md:p-6 p-2" data-testid="billing-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('billing') },
        ]}
      />
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
