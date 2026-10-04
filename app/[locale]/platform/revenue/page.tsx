import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { StatStrip, type StatItem } from '@/components/platform/stat-strip'
import { PlatformPanel, PlatformSection, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { PlanBadge } from '@/components/platform/badges'
import { cn } from '@/lib/utils'

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
  binance: 'Binance Pay',
  manual: 'Manual / offline',
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

  const metrics: StatItem[] = [
    {
      label: 'Platform fees earned',
      value: usd(platformFees),
      detail: 'Your cut of student sales, all time',
    },
    { label: 'Gross merchandise value', value: usd(gmv), detail: 'Total student purchase volume' },
    { label: 'SaaS MRR', value: usd(saasMrr), detail: 'School subscriptions, normalised to monthly' },
    { label: 'Transactions', value: txCount.toLocaleString('en-US'), detail: 'Successful student payments' },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-revenue">
      <PlatformPageHeader
        title="Revenue"
        description="What the platform earns across all schools — fees on student sales plus school subscriptions."
      />

      <StatStrip stats={metrics} className="mb-8" data-testid="revenue-metrics" />

      <div className="grid gap-8 lg:grid-cols-2">
        <PlatformSection title="Platform fees by month" data-testid="revenue-monthly">
          <PlatformPanel className="px-5 py-4">
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fee-bearing sales yet.</p>
            ) : (
              <ol className="space-y-3">
                {monthly.map((m) => {
                  const pct = Math.round((m.fees / maxMonthlyFees) * 100)
                  return (
                    <li key={m.month} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-3 text-xs">
                      <span className="text-muted-foreground tabular-nums">{monthLabel(m.month)}</span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(pct, m.fees > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <span className="w-20 text-right font-medium tabular-nums">{usd(m.fees)}</span>
                    </li>
                  )
                })}
              </ol>
            )}
          </PlatformPanel>
        </PlatformSection>

        <PlatformSection title="By payment provider" data-testid="revenue-by-provider">
          <PlatformPanel>
            {byProvider.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={TH}>Provider</th>
                      <th className={TH_RIGHT}>GMV</th>
                      <th className={TH_RIGHT}>Fees</th>
                      <th className={TH_RIGHT}>Txns</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {byProvider.map((p) => (
                      <tr key={p.provider}>
                        <td className={TD}>{PROVIDER_LABEL[p.provider] ?? p.provider}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{usd(p.gmv)}</td>
                        <td className={cn(TD, 'text-right font-medium tabular-nums')}>{usd(p.fees)}</td>
                        <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>{p.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PlatformPanel>
        </PlatformSection>
      </div>

      <PlatformSection
        title="By school"
        description="Platform fees are each school's revenue-split percentage applied to sales through fee-bearing providers (e.g. Stripe Connect). Manual/offline sales settle directly to schools and carry no fee."
        className="mt-8"
        data-testid="revenue-by-tenant"
      >
        <PlatformPanel>
          {byTenant.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">No school sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className={TH}>School</th>
                    <th className={TH}>Plan</th>
                    <th className={TH_RIGHT}>GMV</th>
                    <th className={TH_RIGHT}>Platform fees</th>
                    <th className={TH_RIGHT}>Txns</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {byTenant.map((t) => (
                    <tr key={t.tenant_id}>
                      <td className={cn(TD, 'font-medium')}>
                        <Link
                          href={`/platform/tenants/${t.tenant_id}`}
                          className="hover:text-primary hover:underline underline-offset-4"
                        >
                          {t.name}
                        </Link>
                      </td>
                      <td className={TD}>
                        <PlanBadge plan={t.plan} />
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{usd(t.gmv)}</td>
                      <td className={cn(TD, 'text-right font-medium tabular-nums')}>{usd(t.fees)}</td>
                      <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>{t.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PlatformPanel>
      </PlatformSection>
    </main>
  )
}
