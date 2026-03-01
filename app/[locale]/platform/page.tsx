import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconBuilding,
  IconChartBar,
  IconCreditCard,
  IconShare,
  IconUsers,
} from '@tabler/icons-react'
import Link from 'next/link'

interface PlatformStats {
  total_tenants: number
  new_tenants_30d: number
  tenants_by_plan: Record<string, number>
  pending_payment_requests: number
  mrr_cents: number
  total_students: number
  total_referral_codes: number
  total_referral_redemptions: number
}

const PLAN_COLORS: Record<string, string> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  business: 'default',
  enterprise: 'default',
}

const PLAN_BAR_COLORS: Record<string, string> = {
  free: 'bg-slate-400',
  starter: 'bg-blue-500',
  pro: 'bg-violet-500',
  business: 'bg-amber-500',
  enterprise: 'bg-emerald-500',
}

export default async function PlatformOverviewPage() {
  const adminClient = createAdminClient()

  const { data: statsRaw } = await adminClient.rpc('get_platform_stats')
  const stats = (statsRaw || {}) as PlatformStats

  const mrr = (stats.mrr_cents ?? 0)
  const planDistribution = stats.tenants_by_plan ?? {}
  const planOrder = ['free', 'starter', 'pro', 'business', 'enterprise']

  const metricCards = [
    {
      title: 'Monthly Recurring Revenue',
      value: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(mrr),
      sub: 'Active subscriptions only',
      icon: IconChartBar,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      accent: 'group-hover:ring-emerald-200 dark:group-hover:ring-emerald-800',
      href: '/platform/billing',
    },
    {
      title: 'Active Tenants',
      value: stats.total_tenants ?? 0,
      sub: `+${stats.new_tenants_30d ?? 0} in last 30 days`,
      icon: IconBuilding,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      accent: 'group-hover:ring-blue-200 dark:group-hover:ring-blue-800',
      href: '/platform/tenants',
    },
    {
      title: 'Total Students',
      value: stats.total_students ?? 0,
      sub: 'Across all schools',
      icon: IconUsers,
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
      accent: 'group-hover:ring-violet-200 dark:group-hover:ring-violet-800',
      href: '/platform/tenants',
    },
    {
      title: 'Pending Payments',
      value: stats.pending_payment_requests ?? 0,
      sub: 'Require confirmation',
      icon: IconCreditCard,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      accent: 'group-hover:ring-amber-200 dark:group-hover:ring-amber-800',
      href: '/platform/billing',
    },
    {
      title: 'Referral Redemptions',
      value: stats.total_referral_redemptions ?? 0,
      sub: `${stats.total_referral_codes ?? 0} active codes`,
      icon: IconShare,
      bg: 'bg-pink-50 dark:bg-pink-950/40',
      iconColor: 'text-pink-600 dark:text-pink-400',
      accent: 'group-hover:ring-pink-200 dark:group-hover:ring-pink-800',
      href: '/platform/referrals',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-overview">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Real-time SaaS metrics across all schools.</p>
      </div>

      {/* Metric Cards */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="platform-metrics">
        {metricCards.map((card) => (
          <Link key={card.title} href={card.href} className="group">
            <Card
              className={`relative overflow-hidden transition-all duration-200 ring-1 ring-transparent ${card.accent} hover:shadow-md`}
              data-testid={`metric-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {card.title}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight" data-testid="metric-value">
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
          </Link>
        ))}
      </div>

      {/* Plan Distribution */}
      <Card data-testid="plan-distribution">
        <CardHeader>
          <CardTitle>Plan Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(planDistribution).length === 0 ? (
            <p className="text-muted-foreground text-sm">No active tenants yet.</p>
          ) : (
            <div className="space-y-4">
              {planOrder.filter(p => planDistribution[p]).map((plan) => {
                const count = planDistribution[plan] ?? 0
                const total = stats.total_tenants || 1
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={plan} className="flex items-center gap-4">
                    <Badge variant={(PLAN_COLORS[plan] || 'outline') as any} className="w-24 justify-center capitalize text-[11px]">
                      {plan}
                    </Badge>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${PLAN_BAR_COLORS[plan] || 'bg-primary'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-16 text-right text-muted-foreground">
                      {count} <span className="text-muted-foreground/50">({pct}%)</span>
                    </span>
                  </div>
                )
              })}
              {Object.entries(planDistribution)
                .filter(([p]) => !planOrder.includes(p))
                .map(([plan, count]) => {
                  const total = stats.total_tenants || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={plan} className="flex items-center gap-4">
                      <Badge variant="outline" className="w-24 justify-center capitalize text-[11px]">{plan}</Badge>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <span className="text-xs font-medium tabular-nums w-16 text-right text-muted-foreground">
                        {count} <span className="text-muted-foreground/50">({pct}%)</span>
                      </span>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
