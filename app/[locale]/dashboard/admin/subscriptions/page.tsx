import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  IconCrown,
  IconSearch,
  IconCalendar,
  IconCurrencyDollar,
  IconUser,
  IconRefresh,
} from '@tabler/icons-react'
import Link from 'next/link'
import { SubscriptionActions } from '@/components/admin/subscription-actions'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

interface SearchParams {
  search?: string
  status?: string
}

export default async function SubscriptionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: SearchParams
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.subscriptions')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  const tenantId = await getCurrentTenantId()
  const search = searchParams.search || ''
  const statusFilter = searchParams.status || 'all'

  // Build query
  let query = supabase
    .from('subscriptions')
    .select(
      `
      subscription_id,
      user_id,
      plan_id,
      subscription_status,
      start_date,
      end_date,
      cancel_at,
      canceled_at,
      cancel_at_period_end,
      current_period_start,
      current_period_end,
      created,
      profiles!subscriptions_user_id_fkey (
        full_name,
        email
      ),
      plans (
        plan_name,
        price,
        currency,
        duration_type
      )
    `
    )
    .eq('tenant_id', tenantId)
    .order('created', { ascending: false })

  // Apply status filter
  if (statusFilter !== 'all') {
    query = query.eq('subscription_status', statusFilter)
  }

  const { data: subscriptions, error } = await query

  // Filter by search on client side (for user names/emails)
  const filteredSubscriptions = subscriptions?.filter((sub) => {
    if (!search) return true
    const profile = sub.profiles as any
    const searchLower = search.toLowerCase()
    return (
      profile?.full_name?.toLowerCase().includes(searchLower) ||
      profile?.email?.toLowerCase().includes(searchLower) ||
      sub.subscription_id.toString().includes(searchLower)
    )
  })

  // Calculate statistics
  const activeCount =
    subscriptions?.filter((s) => s.subscription_status === 'active').length || 0
  const canceledCount =
    subscriptions?.filter((s) => s.subscription_status === 'cancelled').length || 0
  const expiredCount =
    subscriptions?.filter((s) => s.subscription_status === 'expired').length || 0

  const totalRevenue = subscriptions?.reduce((sum, sub) => {
    const plan = sub.plans as any
    if (sub.subscription_status === 'active' && plan?.price) {
      return sum + plan.price
    }
    return sum
  }, 0)

  const stats = [
    {
      title: t('stats.active'),
      value: activeCount,
      icon: IconCrown,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      title: t('stats.cancelled'),
      value: canceledCount,
      icon: IconRefresh,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: t('stats.expired'),
      value: expiredCount,
      icon: IconCalendar,
      bg: 'bg-red-50 dark:bg-red-950/40',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: t('stats.revenue'),
      value: `$${(totalRevenue || 0).toFixed(2)}`,
      icon: IconCurrencyDollar,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
  ]

  return (
    <div className="min-h-screen bg-background" data-testid="subscriptions-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('monetization'), href: '/dashboard/admin/monetization' },
                { label: tBreadcrumbs('subscriptions') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats Grid */}
        <div className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{stat.title}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{stat.value}</p>
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-[18px] w-[18px] ${stat.iconColor}`} strokeWidth={1.75} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <IconSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <form method="get">
                  <Input
                    type="search"
                    name="search"
                    placeholder={t('filters.search')}
                    defaultValue={search}
                    className="pl-9 h-8 text-sm"
                  />
                  {statusFilter !== 'all' && (
                    <input type="hidden" name="status" value={statusFilter} />
                  )}
                </form>
              </div>
              <div className="flex gap-2">
                <Link href="?status=all">
                  <Button
                    variant={statusFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                  >
                    {t('filters.all')}
                  </Button>
                </Link>
                <Link href="?status=active">
                  <Button
                    variant={statusFilter === 'active' ? 'default' : 'outline'}
                    size="sm"
                  >
                    {t('filters.active')}
                  </Button>
                </Link>
                <Link href="?status=cancelled">
                  <Button
                    variant={statusFilter === 'cancelled' ? 'default' : 'outline'}
                    size="sm"
                  >
                    {t('filters.cancelled')}
                  </Button>
                </Link>
                <Link href="?status=expired">
                  <Button
                    variant={statusFilter === 'expired' ? 'default' : 'outline'}
                    size="sm"
                  >
                    {t('filters.expired')}
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscriptions Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title', { count: filteredSubscriptions?.length || 0 })}</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredSubscriptions && filteredSubscriptions.length > 0 ? (
              <div className="space-y-3">
                {filteredSubscriptions.map((subscription) => {
                  const profile = subscription.profiles as any
                  const plan = subscription.plans as any
                  const isActive = subscription.subscription_status === 'active'
                  const isCancelled = subscription.subscription_status === 'cancelled'
                  const isExpired = subscription.subscription_status === 'expired'

                  return (
                    <div
                      key={subscription.subscription_id}
                      className="rounded-lg border p-4"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        {/* User & Plan Info */}
                        <div className="flex-1">
                          <div className="flex items-start gap-3">
                            <div className="rounded-full bg-primary/10 p-2">
                              <IconUser className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/dashboard/admin/users/${subscription.user_id}`}
                                  className="font-medium hover:underline"
                                >
                                  {profile?.full_name || t('table.unknownUser')}
                                </Link>
                                <Badge
                                  variant={
                                    isActive
                                      ? 'default'
                                      : isCancelled
                                        ? 'secondary'
                                        : 'destructive'
                                  }
                                  className={`text-[10px] ${isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                                >
                                  {t(`status.${subscription.subscription_status}`)}
                                </Badge>
                                {subscription.cancel_at_period_end && (
                                  <Badge variant="outline">
                                    {t('table.cancelsAtEnd')}
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {profile?.email}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <IconCrown className="h-4 w-4" />
                                  {plan?.plan_name || t('table.unknownPlan')}
                                </span>
                                <span className="flex items-center gap-1">
                                  <IconCurrencyDollar className="h-4 w-4" />
                                  {plan?.currency} {plan?.price?.toFixed(2)}/
                                  {plan?.duration_type}
                                </span>
                                <span className="flex items-center gap-1">
                                  <IconCalendar className="h-4 w-4" />
                                  {t('table.started')}{' '}
                                  {format(new Date(subscription.start_date), 'MMM d, yyyy', { locale: dateLocale })}
                                </span>
                                {subscription.current_period_end && (
                                  <span className="flex items-center gap-1">
                                    <IconCalendar className="h-4 w-4" />
                                    {isCancelled ? t('table.ended') : t('table.renews')}:{' '}
                                    {format(new Date(subscription.current_period_end), 'MMM d, yyyy', { locale: dateLocale })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2">
                          <SubscriptionActions
                            subscriptionId={subscription.subscription_id}
                            userId={subscription.user_id}
                            status={subscription.subscription_status}
                            cancelAtPeriodEnd={subscription.cancel_at_period_end}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <IconCrown className="mx-auto h-12 w-12 text-muted-foreground" />
                <p className="mt-4 text-muted-foreground">
                  {search || statusFilter !== 'all'
                    ? t('table.noFilteredSubscriptions')
                    : t('table.noSubscriptions')}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
