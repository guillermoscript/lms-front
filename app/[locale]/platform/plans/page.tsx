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
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="platform-plans-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Platform Plans</h1>
          <p className="text-muted-foreground mt-1">Manage pricing and feature limits for all plans.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {(plans || []).map((plan: any) => (
          <Card key={plan.plan_id} className={!plan.is_active ? 'opacity-60' : ''} data-testid="plan-card" data-plan-slug={plan.slug}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg capitalize">{plan.name}</CardTitle>
                <div className="flex gap-2">
                  {!plan.is_active && <Badge variant="secondary">Inactive</Badge>}
                  <Badge variant="outline" className="font-mono text-xs">{plan.slug}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Monthly</p>
                  <p className="font-semibold">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(plan.price_monthly)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Yearly</p>
                  <p className="font-semibold">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(plan.price_yearly)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Txn Fee</p>
                  <p className="font-semibold">{plan.transaction_fee_percent}%</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sort Order</p>
                  <p className="font-semibold">{plan.sort_order ?? '—'}</p>
                </div>
              </div>

              {/* Limits */}
              {plan.limits && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Limits</p>
                  <div className="space-y-1 text-xs">
                    {Object.entries(plan.limits as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <span className="text-muted-foreground">{k.replace(/_/g, ' ')}</span>
                        <span className="font-medium">{String(v) === '-1' ? '∞' : String(v)}</span>
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
