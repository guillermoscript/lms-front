import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PlanEditor } from './plan-editor'

export default async function PlatformPlansPage() {
  const adminClient = createAdminClient()

  const { data: plans } = await adminClient
    .from('platform_plans')
    .select('*')
    .order('sort_order', { ascending: true })

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-plans-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Plans</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage pricing and feature limits for all plans.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(plans || []).map((plan: any) => (
          <Card key={plan.plan_id} className={`transition-all ${!plan.is_active ? 'opacity-50' : 'hover:shadow-md'}`} data-testid="plan-card" data-plan-slug={plan.slug}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize">{plan.name}</CardTitle>
                <div className="flex gap-1.5">
                  {!plan.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
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

              <PlanEditor plan={plan} />
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  )
}
