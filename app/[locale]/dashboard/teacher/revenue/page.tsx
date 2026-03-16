import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { IconCurrencyDollar, IconTrendingUp, IconClock, IconAlertCircle } from '@tabler/icons-react'
import { RevenueChart } from '@/components/teacher/revenue-chart'
import { PayoutHistory } from '@/components/teacher/payout-history'
import { TransactionList } from '@/components/teacher/transaction-list'

export default async function RevenuePage() {
  const role = await getUserRole()

  // Only teachers and admins can access revenue dashboard
  if (role !== 'teacher' && role !== 'admin') {
    redirect('/dashboard/student')
  }

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.teacher.revenue')

  // Parallelize all 4 independent queries
  const [{ data: tenant }, { data: split }, { data: transactions }, { data: payouts }] = await Promise.all([
    supabase.from('tenants').select('name, stripe_account_id').eq('id', tenantId).single(),
    supabase.from('revenue_splits').select('platform_percentage, school_percentage').eq('tenant_id', tenantId).single(),
    supabase.from('transactions').select('amount, status, payment_provider, created_at')
      .eq('tenant_id', tenantId).eq('status', 'successful').order('created_at', { ascending: false }),
    supabase.from('payouts').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
  ])

  // Calculate revenue metrics
  const totalRevenue = transactions?.reduce((sum, t) => sum + parseFloat(t.amount), 0) || 0
  const platformFee = totalRevenue * ((split?.platform_percentage || 20) / 100)
  const schoolRevenue = totalRevenue - platformFee

  // Get recent transactions (last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const recentTransactions = transactions?.filter(
    t => new Date(t.created_at) >= thirtyDaysAgo
  ) || []

  const recentRevenue = recentTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0)

  // Calculate pending payout
  const pendingPayout = payouts?.find(p => p.status === 'pending')?.amount || 0

  // Check if Stripe account is connected
  const isStripeConnected = !!tenant?.stripe_account_id

  const revenueStats = [
    {
      title: t('stats.totalRevenue'),
      value: `$${totalRevenue.toFixed(2)}`,
      sub: t('stats.totalRevenueSub'),
      icon: IconCurrencyDollar,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      accent: 'group-hover:ring-blue-200 dark:group-hover:ring-blue-800',
    },
    {
      title: t('stats.yourShare', { percentage: split?.school_percentage || 80 }),
      value: `$${schoolRevenue.toFixed(2)}`,
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      sub: t('stats.yourShareSub'),
      icon: IconTrendingUp,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      accent: 'group-hover:ring-emerald-200 dark:group-hover:ring-emerald-800',
    },
    {
      title: t('stats.last30Days'),
      value: `$${recentRevenue.toFixed(2)}`,
      sub: t('stats.transactionCount', { count: recentTransactions.length }),
      icon: IconClock,
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
      accent: 'group-hover:ring-violet-200 dark:group-hover:ring-violet-800',
    },
    {
      title: t('stats.pendingPayout'),
      value: `$${pendingPayout.toFixed(2)}`,
      valueColor: 'text-amber-600 dark:text-amber-400',
      sub: t('stats.pendingPayoutSub'),
      icon: IconCurrencyDollar,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      accent: 'group-hover:ring-amber-200 dark:group-hover:ring-amber-800',
    },
  ]

  return (
    <div className="flex-1 space-y-6 p-6 lg:p-8" data-testid="revenue-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('subtitle')}
        </p>
      </div>

      {!isStripeConnected && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-5 ring-1 ring-amber-200 dark:ring-amber-800">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
              <IconAlertCircle className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t('stripeNotConnected.title')}</h3>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                {t('stripeNotConnected.description')}
              </p>
              <a
                href="/api/stripe/connect"
                className="mt-3 inline-flex items-center justify-center rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 h-8 px-4 transition-colors"
              >
                {t('stripeNotConnected.connect')}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {revenueStats.map((stat) => (
          <Card key={stat.title} className={`group transition-all duration-200 ring-1 ring-transparent ${stat.accent} hover:shadow-md`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.title}</p>
                  <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${stat.valueColor || ''}`}>
                    {stat.value}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{stat.sub}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}>
                  <stat.icon className={`h-[18px] w-[18px] ${stat.iconColor}`} strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform Fee Info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('split.title')}</CardTitle>
          <CardDescription>
            {t('split.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('split.platformFee')}</span>
                <Badge variant="secondary" className="text-[10px]">{split?.platform_percentage || 20}%</Badge>
              </div>
              <div className="text-2xl font-bold tabular-nums text-muted-foreground">
                ${platformFee.toFixed(2)}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t('split.platformFeeSub')}
              </p>
            </div>

            <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-4 ring-1 ring-emerald-100 dark:ring-emerald-900/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t('split.yourRevenue')}</span>
                <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">{split?.school_percentage || 80}%</Badge>
              </div>
              <div className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                ${schoolRevenue.toFixed(2)}
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                {t('split.yourRevenueSub')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="transactions">{t('tabs.transactions')}</TabsTrigger>
          <TabsTrigger value="payouts">{t('tabs.payouts')}</TabsTrigger>
          <TabsTrigger value="chart">{t('tabs.chart')}</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <TransactionList transactions={transactions || []} />
        </TabsContent>

        <TabsContent value="payouts" className="space-y-4">
          <PayoutHistory payouts={payouts || []} />
        </TabsContent>

        <TabsContent value="chart" className="space-y-4">
          <RevenueChart transactions={transactions || []} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
