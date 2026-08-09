import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { IconAlertTriangle } from '@tabler/icons-react'
import {
  summarizePlanPurchasability,
  type PlatformPlanPriceInput,
} from '@/lib/billing/plan-prices'
import { getPlatformProviderRuntimeStatuses } from '@/lib/billing/platform-checkout-runtime'
import { PlanEditor } from './plan-editor'
import {
  PlanPricesEditor,
  PlanPurchasabilityBadge,
  PlanPurchasabilityChip,
} from './plan-prices-editor'

export default async function PlatformPlansPage() {
  const adminClient = createAdminClient()

  const [{ data: plans }, { data: priceRows }] = await Promise.all([
    adminClient.from('platform_plans').select('*').order('sort_order', { ascending: true }),
    adminClient
      .from('platform_plan_prices')
      .select('*')
      .order('payment_provider', { ascending: true })
      .order('interval', { ascending: true }),
  ])

  // Mapped rather than `as`-cast so a drifting select list fails the build here
  // instead of rendering a plan as unpurchasable when it is merely unmapped.
  const prices: PlatformPlanPriceInput[] = (priceRows || []).map((row) => ({
    priceId: row.price_id,
    planId: row.plan_id,
    paymentProvider: row.payment_provider,
    interval: row.interval,
    providerPriceId: row.provider_price_id,
    currency: row.currency,
    amount: row.amount,
    isActive: row.is_active,
  }))
  const providerStatuses = getPlatformProviderRuntimeStatuses()

  const purchasability = summarizePlanPurchasability(
    (plans || []).map((plan) => ({
      planId: plan.plan_id,
      slug: plan.slug,
      name: plan.name,
      priceMonthly: Number(plan.price_monthly ?? 0),
      priceYearly: Number(plan.price_yearly ?? 0),
      isActive: plan.is_active,
    })),
    prices,
    { providerStatuses },
  )
  const purchasabilityByPlan = new Map(purchasability.map((p) => [p.planId, p]))
  const unpurchasableCount = purchasability.filter(
    (p) => p.isActive && p.isPaid && !p.isPurchasable,
  ).length

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-plans-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage pricing, provider prices and feature limits for all plans.</p>
        </div>
      </div>

      {unpurchasableCount > 0 && (
        <div
          className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
          data-testid="plans-unpurchasable-warning"
          role="status"
        >
          <IconAlertTriangle
            className="mt-0.5 h-[18px] w-[18px] shrink-0 text-red-700 dark:text-red-400"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium text-red-800 dark:text-red-300">
              {unpurchasableCount} active paid {unpurchasableCount === 1 ? 'plan is' : 'plans are'} not purchasable
            </p>
            <p className="mt-0.5 text-red-700/80 dark:text-red-400/80">
              They are advertised on the pricing page but have no executable automated provider.
              Check the status under <strong>Prices</strong>.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(plans || []).map((plan) => {
          const summary = purchasabilityByPlan.get(plan.plan_id)
          const planPrices = prices.filter((p) => p.planId === plan.plan_id)
          return (
          <Card key={plan.plan_id} className={`transition-all ${!plan.is_active ? 'opacity-50' : 'hover:shadow-md'}`} data-testid="plan-card" data-plan-slug={plan.slug}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize">{plan.name}</CardTitle>
                <div className="flex gap-1.5">
                  {!plan.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  {plan.is_active && summary?.isPaid && (
                    <PlanPurchasabilityChip isPurchasable={summary.isPurchasable} />
                  )}
                  <Badge variant="outline" className="font-mono text-[10px]">{plan.slug}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Monthly</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(plan.price_monthly)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Yearly</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(plan.price_yearly)}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Txn Fee</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{plan.transaction_fee_percent}%</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Sort Order</p>
                  <p className="mt-1 text-lg font-bold tabular-nums">{plan.sort_order ?? '—'}</p>
                </div>
              </div>

              {/* Limits */}
              {plan.limits && (
                <div className="border-t pt-4">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Limits</p>
                  <div className="space-y-2 text-xs">
                    {Object.entries(plan.limits as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between">
                        <span className="capitalize text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                        <span className="font-semibold tabular-nums">{String(v) === '-1' ? '∞' : String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Purchasability — the #602 check, per plan. */}
              <div className="border-t pt-4">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">Checkout</p>
                {summary && (
              <PlanPurchasabilityBadge
                    isPaid={summary.isPaid}
                    isPurchasable={summary.isPurchasable}
                    providers={summary.automatedProviders}
                    missingIntervals={summary.missingIntervals}
                    diagnostics={summary.providerDiagnostics}
                  />
                )}
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <PlanPricesEditor
                  planId={plan.plan_id}
                  planSlug={plan.slug}
                  prices={planPrices}
                  providerDiagnostics={summary?.providerDiagnostics}
                  providerStatuses={providerStatuses}
                />
              </div>

              <PlanEditor plan={plan} />
            </CardContent>
          </Card>
          )
        })}
      </div>
    </main>
  )
}
