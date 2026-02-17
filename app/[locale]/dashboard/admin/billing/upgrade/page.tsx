import { getAvailablePlans, getSubscriptionStatus } from '@/app/actions/admin/billing'
import { UpgradePageClient } from './upgrade-page-client'

export default async function UpgradePage() {
  const [plans, status] = await Promise.all([
    getAvailablePlans(),
    getSubscriptionStatus(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Upgrade Your Plan</h1>
        <p className="text-muted-foreground">
          Choose the plan that best fits your school&apos;s needs
        </p>
      </div>

      <UpgradePageClient
        plans={plans}
        currentPlan={status.plan}
      />
    </div>
  )
}
