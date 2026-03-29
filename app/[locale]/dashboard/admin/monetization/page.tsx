import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getRevenueOverview } from '@/app/actions/admin/revenue'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import Link from 'next/link'
import { formatCurrency } from '@/lib/currency'
import {
  IconAlertCircle,
  IconCheck,
  IconCurrencyDollar,
  IconShoppingCart,
  IconCalendar,
  IconTrendingUp,
  IconReceipt,
  IconCrown,
  IconFileInvoice,
  IconArrowRight,
} from '@tabler/icons-react'

export default async function MonetizationPage() {
  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const t = await getTranslations('dashboard.admin.monetization')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')

  // Parallelize all 6 independent queries
  const [
    { data: tenant },
    { data: split },
    revenue,
    { count: productCount },
    { count: planCount },
    { count: subscriptionCount },
  ] = await Promise.all([
    supabase.from('tenants').select('stripe_account_id').eq('id', tenantId).single(),
    supabase.from('revenue_splits').select('platform_percentage, school_percentage').eq('tenant_id', tenantId).single(),
    getRevenueOverview(),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('plans').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('deleted_at', null),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('subscription_status', 'active'),
  ])

  const isStripeConnected = !!tenant?.stripe_account_id
  const platformPercentage = split?.platform_percentage ?? 20
  const schoolPercentage = split?.school_percentage ?? 80

  const quickStats = [
    {
      title: t('stats.totalRevenue'),
      value: formatCurrency(revenue.totalRevenue, revenue.currency),
      icon: IconCurrencyDollar,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: t('stats.activeProducts'),
      value: String(productCount ?? 0),
      icon: IconShoppingCart,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: t('stats.activePlans'),
      value: String(planCount ?? 0),
      icon: IconCalendar,
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: t('stats.activeSubscriptions'),
      value: String(subscriptionCount ?? 0),
      icon: IconCrown,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
  ]

  const navCards = [
    {
      title: t('nav.products'),
      description: t('nav.productsDesc'),
      href: '/dashboard/admin/products',
      icon: IconShoppingCart,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: t('nav.plans'),
      description: t('nav.plansDesc'),
      href: '/dashboard/admin/plans',
      icon: IconCalendar,
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
    },
    {
      title: t('nav.revenue'),
      description: t('nav.revenueDesc'),
      href: '/dashboard/admin/revenue',
      icon: IconTrendingUp,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: t('nav.transactions'),
      description: t('nav.transactionsDesc'),
      href: '/dashboard/admin/transactions',
      icon: IconReceipt,
      bg: 'bg-orange-50 dark:bg-orange-950/40',
      iconColor: 'text-orange-600 dark:text-orange-400',
    },
    {
      title: t('nav.subscriptions'),
      description: t('nav.subscriptionsDesc'),
      href: '/dashboard/admin/subscriptions',
      icon: IconCrown,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: t('nav.paymentRequests'),
      description: t('nav.paymentRequestsDesc'),
      href: '/dashboard/admin/payment-requests',
      icon: IconFileInvoice,
      bg: 'bg-pink-50 dark:bg-pink-950/40',
      iconColor: 'text-pink-600 dark:text-pink-400',
    },
  ]

  return (
    <div className="min-h-screen bg-background" data-testid="monetization-page">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        {/* Stripe Connect Status */}
        {isStripeConnected ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-5 ring-1 ring-emerald-200 dark:ring-emerald-800">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                <IconCheck className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  {t('stripe.connected')}
                </h3>
                <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
                  {t('stripe.connectedDesc')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-5 ring-1 ring-amber-200 dark:ring-amber-800">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
                <IconAlertCircle className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  {t('stripe.notConnected')}
                </h3>
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                  {t('stripe.notConnectedDesc')}
                </p>
                <a
                  href="/api/stripe/connect"
                  className="mt-3 inline-flex items-center justify-center rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 h-8 px-4 transition-colors"
                >
                  {t('stripe.connect')}
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Revenue Split */}
        <Card>
          <CardHeader>
            <CardTitle>{t('split.title')}</CardTitle>
            <CardDescription>{t('split.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('split.platformFee')}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {platformPercentage}%
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  {t('split.platformFeeDesc')}
                </p>
              </div>
              <div className="rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 p-4 ring-1 ring-emerald-100 dark:ring-emerald-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t('split.yourRevenue')}
                  </span>
                  <Badge variant="default" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    {schoolPercentage}%
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground/70">
                  {t('split.yourRevenueDesc')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {quickStats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                      {stat.value}
                    </p>
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-[18px] w-[18px] ${stat.iconColor}`} strokeWidth={1.75} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Navigation Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4">{t('nav.title')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {navCards.map((card) => (
              <Link key={card.href} href={card.href}>
                <Card className="group transition-all duration-200 hover:shadow-md hover:ring-1 hover:ring-primary/20 h-full">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                        <card.icon className={`h-5 w-5 ${card.iconColor}`} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold">{card.title}</h3>
                          <IconArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {card.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
