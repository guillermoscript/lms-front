import { getAvailablePlans, getSubscriptionStatus } from '@/app/actions/admin/billing'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { UpgradePageClient } from './upgrade-page-client'

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>
}) {
  const t = await getTranslations('dashboard.admin')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const [plans, status, { plan: planParam, interval: intervalParam }] = await Promise.all([
    getAvailablePlans(),
    getSubscriptionStatus(),
    searchParams,
  ])

  // Pre-select only a real, paid, non-current plan; ignore anything else.
  const preselectedPlan = plans.some(
    (p) => p.slug === planParam && p.slug !== 'free' && p.slug !== status.plan,
  )
    ? planParam
    : undefined
  const preselectedInterval =
    intervalParam === 'yearly' || intervalParam === 'monthly' ? intervalParam : undefined

  const sub = status.subscription
  const activeStripeSub = !!sub && sub.paymentMethod === 'stripe' && sub.status === 'active'
  const currentInterval: 'monthly' | 'yearly' = sub?.interval === 'yearly' ? 'yearly' : 'monthly'

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="upgrade-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('billing'), href: '/dashboard/admin/billing' },
          { label: tBreadcrumbs('upgrade') },
        ]}
      />
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upgrade Your Plan</h1>
        <p className="text-muted-foreground">
          Choose the plan that best fits your school&apos;s needs
        </p>
      </div>

      <UpgradePageClient
        plans={plans}
        currentPlan={status.plan}
        preselectedPlan={preselectedPlan}
        preselectedInterval={preselectedInterval}
        activeStripeSub={activeStripeSub}
        currentInterval={currentInterval}
      />
    </div>
  )
}
