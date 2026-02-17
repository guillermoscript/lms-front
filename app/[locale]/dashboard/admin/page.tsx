import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconUsers,
  IconBook,
  IconCertificate,
  IconCurrencyDollar,
  IconChecklist,
  IconReceipt,
  IconChartBar,
  IconCrown,
  IconSettings,
} from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UsageMeter } from '@/components/admin/usage-meter'

export default async function AdminDashboardPage({
  params: { locale }
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('dashboard.admin.main')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get platform statistics
  const [
    { count: totalUsers },
    { count: totalCourses },
    { count: publishedCourses },
    { count: totalEnrollments },
    { count: totalTransactions },
    { count: pendingPaymentRequests },
    { count: activeSubscriptions },
    { data: recentTransactions },
    { data: recentUsers },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'published'),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }),
    supabase.from('transactions').select('*', { count: 'exact', head: true }),
    supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'contacted', 'payment_received']),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
    supabase
      .from('transactions')
      .select('transaction_id, amount, status, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('profiles')
      .select('id, full_name, email, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Get user details for transactions
  const transactionsWithUsers = await Promise.all(
    (recentTransactions || []).map(async (t) => {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', t.user_id)
        .single()
      return { ...t, user: userProfile }
    })
  )

  // Calculate total revenue (successful transactions)
  const { data: successfulTransactions } = await supabase
    .from('transactions')
    .select('amount')
    .eq('status', 'successful')

  const totalRevenue =
    successfulTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Get plan info for usage widget
  const tenantId = await getCurrentTenantId()
  const adminClient = await createAdminClient()
  const { data: tenant } = await adminClient
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .single()
  const planSlug = tenant?.plan || 'free'
  const { data: platformPlan } = await adminClient
    .from('platform_plans')
    .select('name, limits')
    .eq('slug', planSlug)
    .eq('is_active', true)
    .single()
  const planLimits = (platformPlan?.limits as { max_courses?: number; max_students?: number }) || { max_courses: 5, max_students: 50 }
  const { count: studentCount } = await adminClient
    .from('tenant_users')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('role', 'student')
    .eq('status', 'active')

  const stats = [
    {
      title: t('stats.totalUsers'),
      value: totalUsers || 0,
      icon: IconUsers,
      link: '/dashboard/admin/users',
      color: 'text-blue-500',
    },
    {
      title: t('stats.activeSubscriptions'),
      value: activeSubscriptions || 0,
      subtitle: t('stats.monthly'),
      icon: IconCrown,
      link: '/dashboard/admin/subscriptions',
      color: 'text-purple-500',
    },
    {
      title: t('stats.totalCourses'),
      value: totalCourses || 0,
      subtitle: t('stats.published', { count: publishedCourses || 0 }),
      icon: IconBook,
      link: '/dashboard/admin/courses',
      color: 'text-green-500',
    },
    {
      title: t('stats.pendingPayments'),
      value: pendingPaymentRequests || 0,
      subtitle: t('stats.awaiting'),
      icon: IconReceipt,
      link: '/dashboard/admin/payment-requests',
      color: 'text-orange-500',
    },
    {
      title: t('stats.totalRevenue'),
      value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue),
      subtitle: t('stats.transactions', { count: totalTransactions || 0 }),
      icon: IconCurrencyDollar,
      link: '/dashboard/admin/transactions',
      color: 'text-yellow-500',
    },
  ]

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="admin-dashboard">
      {/* Plan & Usage Widget */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">Plan</span>
                  <Badge variant={planSlug === 'free' ? 'secondary' : 'default'}>
                    {platformPlan?.name || 'Free'}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="grid flex-1 gap-4 sm:grid-cols-2 sm:max-w-md">
              <UsageMeter
                label="Courses"
                current={totalCourses || 0}
                limit={planLimits.max_courses ?? 5}
              />
              <UsageMeter
                label="Students"
                current={studentCount || 0}
                limit={planLimits.max_students ?? 50}
              />
            </div>
            <Link href="/dashboard/admin/billing/upgrade">
              <Button variant="outline" size="sm">
                {planSlug === 'free' ? 'Upgrade' : 'Change Plan'}
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5" data-testid="admin-stats-grid">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.link}>
            <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="mt-2 text-3xl font-bold">{stat.value}</p>
                    {stat.subtitle && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                  <stat.icon className={`h-10 w-10 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconChecklist className="h-5 w-5" />
            {t('quickActions.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
            <Link href="/dashboard/admin/analytics">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconChartBar className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.analytics')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/users">
              <Button variant="outline" className="w-full text-xs px-2" id="quick-action-users">
                <IconUsers className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.manageUsers')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/courses">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconBook className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.manageCourses')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/subscriptions">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconCrown className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.subscriptions')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/payment-requests">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconReceipt className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.paymentRequests')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/transactions">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconCurrencyDollar className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.viewTransactions')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/enrollments">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconCertificate className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.viewEnrollments')}</span>
              </Button>
            </Link>
            <Link href="/dashboard/admin/settings">
              <Button variant="outline" className="w-full text-xs px-2">
                <IconSettings className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t('quickActions.settings')}</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('recentActivity.users')}</span>
              <Link href="/dashboard/admin/users">
                <Button variant="ghost" size="sm">
                  {t('recentActivity.viewAll')}
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentUsers && recentUsers.length > 0 ? (
                recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{user.full_name || t('recentActivity.unknown')}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(user.created_at), 'MMM d, yyyy', { locale: dateLocale })}
                    </p>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {t('recentActivity.noUsers')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{t('recentActivity.transactions')}</span>
              <Link href="/dashboard/admin/transactions">
                <Button variant="ghost" size="sm">
                  {t('recentActivity.viewAll')}
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {transactionsWithUsers && transactionsWithUsers.length > 0 ? (
                transactionsWithUsers.map((transaction) => (
                  <div
                    key={transaction.transaction_id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {transaction.user?.full_name || t('recentActivity.unknown')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.user?.email}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(transaction.amount)}
                      </p>
                      <p
                        className={`text-xs ${transaction.status === 'successful'
                          ? 'text-green-500'
                          : transaction.status === 'pending'
                            ? 'text-yellow-500'
                            : 'text-red-500'
                          }`}
                      >
                        {t(`recentActivity.status.${transaction.status}`)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-muted-foreground">
                  {t('recentActivity.noTransactions')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
