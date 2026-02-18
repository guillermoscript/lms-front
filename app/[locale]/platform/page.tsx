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
      color: 'text-green-500',
      href: '/platform/billing',
    },
    {
      title: 'Total Active Tenants',
      value: stats.total_tenants ?? 0,
      sub: `+${stats.new_tenants_30d ?? 0} in last 30 days`,
      icon: IconBuilding,
      color: 'text-blue-500',
      href: '/platform/tenants',
    },
    {
      title: 'Total Students',
      value: stats.total_students ?? 0,
      sub: 'Across all schools',
      icon: IconUsers,
      color: 'text-purple-500',
      href: '/platform/tenants',
    },
    {
      title: 'Pending Payments',
      value: stats.pending_payment_requests ?? 0,
      sub: 'Require confirmation',
      icon: IconCreditCard,
      color: 'text-orange-500',
      href: '/platform/billing',
    },
    {
      title: 'Referral Redemptions',
      value: stats.total_referral_redemptions ?? 0,
      sub: `${stats.total_referral_codes ?? 0} active codes`,
      icon: IconShare,
      color: 'text-pink-500',
      href: '/platform/referrals',
    },
  ]

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="platform-overview">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Platform Overview</h1>
        <p className="text-muted-foreground mt-1">Real-time SaaS metrics across all schools.</p>
      </div>

      {/* Metric Cards */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-testid="platform-metrics">
        {metricCards.map((card) => (
          <Link key={card.title} href={card.href}>
            <Card
              className="transition-all hover:border-primary/50 hover:shadow-sm"
              data-testid={`metric-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="mt-2 text-3xl font-bold" data-testid="metric-value">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.sub}</p>
                  </div>
                  <card.icon className={`h-8 w-8 ${card.color} shrink-0`} />
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
            <div className="space-y-3">
              {planOrder.filter(p => planDistribution[p]).map((plan) => {
                const count = planDistribution[plan] ?? 0
                const total = stats.total_tenants || 1
                const pct = Math.round((count / total) * 100)
                return (
                  <div key={plan} className="flex items-center gap-4">
                    <Badge variant={(PLAN_COLORS[plan] || 'outline') as any} className="w-20 justify-center capitalize">
                      {plan}
                    </Badge>
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{count} ({pct}%)</span>
                  </div>
                )
              })}
              {/* Show plans not in ordered list */}
              {Object.entries(planDistribution)
                .filter(([p]) => !planOrder.includes(p))
                .map(([plan, count]) => {
                  const total = stats.total_tenants || 1
                  const pct = Math.round((count / total) * 100)
                  return (
                    <div key={plan} className="flex items-center gap-4">
                      <Badge variant="outline" className="w-20 justify-center capitalize">{plan}</Badge>
                      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium w-12 text-right">{count} ({pct}%)</span>
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
