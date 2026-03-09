import { getSubscriptionStatus, getManualPaymentRequests } from '@/app/actions/admin/billing'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { BillingDashboardClient } from './billing-dashboard-client'

export default async function BillingPage() {
  const t = await getTranslations('dashboard.admin.billing')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const [status, paymentRequests] = await Promise.all([
    getSubscriptionStatus(),
    getManualPaymentRequests(),
  ])

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="billing-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('billing') },
        ]}
      />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      <BillingDashboardClient
        status={status}
        paymentRequests={paymentRequests}
      />
    </div>
  )
}
