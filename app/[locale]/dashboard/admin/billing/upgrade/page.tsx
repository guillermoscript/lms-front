import { getAvailablePlans, getSubscriptionStatus } from '@/app/actions/admin/billing'
import { getTranslations } from 'next-intl/server'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { PROVIDER_CAPABILITIES, type PaymentProvider } from '@/lib/payments/types'
import { evaluatePlatformCheckoutAvailability } from '@/lib/billing/platform-checkout-availability'
import { getTenantPlatformProviderStatuses } from '@/lib/billing/platform-checkout-runtime'
import { UpgradePageClient } from './upgrade-page-client'

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>
}) {
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

  // Which providers each plan can actually be bought through. Read under the
  // caller's own RLS — `platform_plan_prices` exposes active rows to everyone,
  // the same read the pricing page does — so an admin never sees a payment
  // method a super admin has not priced (#603).
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const [providerStatuses, { data: priceRows }] = await Promise.all([
    getTenantPlatformProviderStatuses(supabase, tenantId),
    supabase
      .from('platform_plan_prices')
      .select('plan_id, payment_provider, interval, provider_price_id, currency, amount')
      .eq('is_active', true),
  ])

  const planProviders: Record<string, { monthly: string[]; yearly: string[] }> = {}
  for (const row of priceRows ?? []) {
    const plan = plans.find((candidate) => candidate.plan_id === row.plan_id)
    if (!plan) continue
    const interval = row.interval === 'yearly' ? 'yearly' : 'monthly'
    const availability = evaluatePlatformCheckoutAvailability({
      provider: row.payment_provider,
      interval,
      price: {
        interval: row.interval,
        currency: row.currency,
        providerPriceId: row.provider_price_id,
        amount: row.amount === null ? null : Number(row.amount),
      },
      fallbackAmount: interval === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly),
      runtime: providerStatuses[row.payment_provider],
    })
    if (!availability.available) continue
    const bucket = (planProviders[row.plan_id] ??= { monthly: [], yearly: [] })
    if (!bucket[interval].includes(row.payment_provider)) bucket[interval].push(row.payment_provider)
  }

  const sub = status.subscription
  const activeSubscriptionProvider =
    sub && sub.status === 'active' && sub.paymentProvider ? sub.paymentProvider : null
  // Whether the live rail can swap the price on the existing subscription. A
  // provider that cannot (manual, PayPal) sends the school back through
  // checkout, which supersedes rather than swaps.
  const canChangePlanInPlace =
    !!activeSubscriptionProvider &&
    !!PROVIDER_CAPABILITIES[activeSubscriptionProvider as PaymentProvider]?.supportsPlanChange
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
        planProviders={planProviders}
        activeSubscriptionProvider={activeSubscriptionProvider}
        canChangePlanInPlace={canChangePlanInPlace}
        currentInterval={currentInterval}
      />
    </div>
  )
}
