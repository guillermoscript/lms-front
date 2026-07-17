import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconReportMoney,
  IconCoin,
  IconBuildingBank,
  IconReceipt,
} from '@tabler/icons-react'

interface ProviderRow {
  provider: string
  gmv: number
  fees: number
  count: number
}
interface TenantRow {
  tenant_id: string
  name: string
  plan: string
  gmv: number
  fees: number
  count: number
}
interface MonthlyRow {
  month: string
  gmv: number
  fees: number
}
interface PlatformRevenue {
  gmv: number
  platform_fees: number
  transaction_count: number
  saas_mrr: number
  by_provider: ProviderRow[]
  by_tenant: TenantRow[]
  monthly: MonthlyRow[]
}

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const PROVIDER_LABEL: Record<string, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  lemonsqueezy: 'Lemon Squeezy',
  solana: 'Solana',
  solana_subs: 'Solana subscriptions',
  manual: 'Manual / offline',
}

const PLAN_COLORS: Record<string, string> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  business: 'default',
  enterprise: 'default',
}

function monthLabel(ym: string) {
  // ym = "YYYY-MM"
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
}

export default async function PlatformRevenuePage() {
  const adminClient = createAdminClient()

  const { data: raw } = await adminClient.rpc('get_platform_revenue')
  const rev = (raw || {}) as PlatformRevenue

  const platformFees = rev.platform_fees ?? 0
  const gmv = rev.gmv ?? 0
  const saasMrr = rev.saas_mrr ?? 0
  const txCount = rev.transaction_count ?? 0
  const byProvider = rev.by_provider ?? []
  const byTenant = rev.by_tenant ?? []
  const monthly = rev.monthly ?? []
  const maxMonthlyFees = Math.max(...monthly.map((m) => m.fees), 0.0001)

  const metricCards = [
    {
      title: 'Platform Fees Earned',
      value: usd(platformFees),
      sub: 'Your cut of student sales (all time)',
      icon: IconReportMoney,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: 'Gross Merchandise Value',
      value: usd(gmv),
      sub: 'Total student purchase volume',
      icon: IconCoin,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'SaaS MRR',
      value: usd(saasMrr),
      sub: 'Recurring from school plans',
      icon: IconBuildingBank,
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: 'Transactions',
      value: txCount.toLocaleString('en-US'),
      sub: 'Successful student payments',
      icon: IconReceipt,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-revenue">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Revenue</h1>
        <p className="text-sm text-muted-foreground mt-1">
          What the platform earns across all schools — fees on student sales plus school subscriptions.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="revenue-metrics">
        {metricCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" data-testid="metric-value">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{card.sub}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                  <card.icon className={`h-[18px] w-[18px] ${card.iconColor}`} strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly platform fees trend */}
        <Card data-testid="revenue-monthly">
          <CardHeader>
            <CardTitle>Platform fees over time</CardTitle>
          </CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transactions yet.</p>
            ) : (
              <div className="space-y-3">
                {monthly.map((m) => {
                  const pct = Math.round((m.fees / maxMonthlyFees) * 100)
                  return (
                    <div key={m.month} className="flex items-center gap-4">
                      <span className="w-14 shrink-0 text-xs font-medium text-muted-foreground">
                        {monthLabel(m.month)}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${Math.max(pct, m.fees > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs font-medium tabular-nums">
                        {usd(m.fees)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* By provider */}
        <Card data-testid="revenue-by-provider">
          <CardHeader>
            <CardTitle>By payment provider</CardTitle>
          </CardHeader>
          <CardContent>
            {byProvider.length === 0 ? (
              <p className="text-muted-foreground text-sm">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="pb-2 font-medium">Provider</th>
                      <th className="pb-2 text-right font-medium">GMV</th>
                      <th className="pb-2 text-right font-medium">Fees</th>
                      <th className="pb-2 text-right font-medium">Txns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byProvider.map((p) => (
                      <tr key={p.provider} className="border-b last:border-0">
                        <td className="py-2.5">{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                        <td className="py-2.5 text-right tabular-nums">{usd(p.gmv)}</td>
                        <td className="py-2.5 text-right tabular-nums font-medium">{usd(p.fees)}</td>
                        <td className="py-2.5 text-right tabular-nums text-muted-foreground">{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* By tenant */}
      <Card className="mt-6" data-testid="revenue-by-tenant">
        <CardHeader>
          <CardTitle>By school</CardTitle>
        </CardHeader>
        <CardContent>
          {byTenant.length === 0 ? (
            <p className="text-muted-foreground text-sm">No school sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">School</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 text-right font-medium">GMV</th>
                    <th className="pb-2 text-right font-medium">Platform fees</th>
                    <th className="pb-2 text-right font-medium">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {byTenant.map((t) => (
                    <tr key={t.tenant_id} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{t.name}</td>
                      <td className="py-2.5">
                        <Badge variant={(PLAN_COLORS[t.plan] || 'outline') as any} className="capitalize text-[11px]">
                          {t.plan}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{usd(t.gmv)}</td>
                      <td className="py-2.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {usd(t.fees)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-[11px] text-muted-foreground/70">
        Platform fees are the configured revenue-split percentage applied to sales through fee-bearing
        providers (e.g. Stripe Connect). Manual/offline sales settle directly to schools and carry no
        platform fee.
      </p>
    </main>
  )
}
