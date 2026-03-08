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
  IconReceipt,
  IconChartBar,
  IconCrown,
  IconSettings,
  IconArrowUpRight,
  IconSparkles,
  IconUserPlus,
} from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UsageMeter } from '@/components/admin/usage-meter'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import * as motion from 'motion/react-client'

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.main')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get tenant context for all queries
  const tenantId = await getCurrentTenantId()

  // Get platform statistics — ALL queries scoped to current tenant
  const [
    { count: totalUsers },
    { count: totalCourses },
    { count: publishedCourses },
    { count: totalEnrollments },
    { count: totalTransactions },
    { count: pendingPaymentRequests },
    { count: activeSubscriptions },
    { data: recentTransactions },
    { data: recentTenantUsers },
  ] = await Promise.all([
    supabase.from('tenant_users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('courses').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'published'),
    supabase.from('enrollments').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('transactions').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('payment_requests')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'contacted', 'payment_received']),
    supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('subscription_status', 'active'),
    supabase
      .from('transactions')
      .select('transaction_id, amount, status, created_at, user_id')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('tenant_users')
      .select('user_id, created_at, profiles(id, full_name)')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  // Batch-fetch user profiles for transactions (avoids N+1)
  const transactionUserIds = [...new Set((recentTransactions || []).map(t => t.user_id).filter(Boolean))]
  const { data: transactionProfiles } = transactionUserIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', transactionUserIds)
    : { data: [] }
  const profileMap = new Map((transactionProfiles || []).map(p => [p.id, p]))
  const transactionsWithUsers = (recentTransactions || []).map(t => ({
    ...t,
    user: profileMap.get(t.user_id) || null,
  }))

  // Calculate total revenue (successful transactions) — tenant scoped
  const { data: successfulTransactions } = await supabase
    .from('transactions')
    .select('amount')
    .eq('tenant_id', tenantId)
    .eq('status', 'successful')

  const totalRevenue =
    successfulTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // Get plan info for usage widget
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
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      accent: 'group-hover:ring-blue-200 dark:group-hover:ring-blue-800',
    },
    {
      title: t('stats.activeSubscriptions'),
      value: activeSubscriptions || 0,
      subtitle: t('stats.monthly'),
      icon: IconCrown,
      link: '/dashboard/admin/subscriptions',
      bg: 'bg-violet-50 dark:bg-violet-950/40',
      iconColor: 'text-violet-600 dark:text-violet-400',
      accent: 'group-hover:ring-violet-200 dark:group-hover:ring-violet-800',
    },
    {
      title: t('stats.totalCourses'),
      value: totalCourses || 0,
      subtitle: t('stats.published', { count: publishedCourses || 0 }),
      icon: IconBook,
      link: '/dashboard/admin/courses',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      accent: 'group-hover:ring-emerald-200 dark:group-hover:ring-emerald-800',
    },
    {
      title: t('stats.pendingPayments'),
      value: pendingPaymentRequests || 0,
      subtitle: t('stats.awaiting'),
      icon: IconReceipt,
      link: '/dashboard/admin/payment-requests',
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      accent: 'group-hover:ring-amber-200 dark:group-hover:ring-amber-800',
    },
    {
      title: t('stats.totalRevenue'),
      value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue),
      subtitle: t('stats.transactions', { count: totalTransactions || 0 }),
      icon: IconCurrencyDollar,
      link: '/dashboard/admin/transactions',
      bg: 'bg-teal-50 dark:bg-teal-950/40',
      iconColor: 'text-teal-600 dark:text-teal-400',
      accent: 'group-hover:ring-teal-200 dark:group-hover:ring-teal-800',
    },
  ]

  const quickActions = [
    { href: '/dashboard/admin/analytics', icon: IconChartBar, label: t('quickActions.analytics') },
    { href: '/dashboard/admin/users', icon: IconUsers, label: t('quickActions.manageUsers'), id: 'quick-action-users' },
    { href: '/dashboard/admin/courses', icon: IconBook, label: t('quickActions.manageCourses') },
    { href: '/dashboard/admin/subscriptions', icon: IconCrown, label: t('quickActions.subscriptions') },
    { href: '/dashboard/admin/payment-requests', icon: IconReceipt, label: t('quickActions.paymentRequests') },
    { href: '/dashboard/admin/transactions', icon: IconCurrencyDollar, label: t('quickActions.viewTransactions') },
    { href: '/dashboard/admin/enrollments', icon: IconCertificate, label: t('quickActions.viewEnrollments') },
    { href: '/dashboard/admin/settings', icon: IconSettings, label: t('quickActions.settings') },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="admin-dashboard">
      <div className="mb-6">
        <AdminBreadcrumb
          items={[
            { label: tBreadcrumbs('admin') },
          ]}
        />
      </div>

      {/* Getting Started Checklist */}
      <OnboardingChecklist
        storageKey={`admin-${user.id}`}
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        steps={[
          {
            id: 'configure-school',
            label: t('onboarding.configureSchool'),
            description: t('onboarding.configureSchoolDesc'),
            href: '/dashboard/admin/settings',
            completed: true, // They got through initial onboarding wizard to reach here
          },
          {
            id: 'add-course',
            label: t('onboarding.addCourse'),
            description: t('onboarding.addCourseDesc'),
            href: '/dashboard/teacher/courses/new',
            completed: (totalCourses || 0) > 0,
          },
          {
            id: 'invite-users',
            label: t('onboarding.inviteUsers'),
            description: t('onboarding.inviteUsersDesc'),
            href: '/dashboard/admin/users',
            completed: (totalUsers || 0) > 1, // More than just the admin
          },
          {
            id: 'review-billing',
            label: t('onboarding.reviewBilling'),
            description: t('onboarding.reviewBillingDesc'),
            href: '/dashboard/admin/billing/upgrade',
            completed: planSlug !== 'free',
          },
        ]}
      />

      {/* Plan & Usage Banner */}
      <div className="relative mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent ring-1 ring-primary/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/[0.08] via-transparent to-transparent" />
        <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <IconSparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold tracking-tight">
                  {platformPlan?.name || 'Free'} {t('plan.label')}
                </span>
                <Badge
                  variant={planSlug === 'free' ? 'secondary' : 'default'}
                  className="text-[10px] uppercase tracking-wider"
                >
                  {planSlug === 'free' ? t('plan.current') : t('plan.active')}
                </Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {planSlug === 'free'
                  ? t('plan.upgradeHint')
                  : t('plan.activeHint')}
              </p>
            </div>
          </div>
          <div className="grid flex-1 gap-5 sm:grid-cols-2 sm:max-w-sm">
            <UsageMeter
              label={t('plan.courses')}
              current={totalCourses || 0}
              limit={planLimits.max_courses ?? 5}
            />
            <UsageMeter
              label={t('plan.students')}
              current={studentCount || 0}
              limit={planLimits.max_students ?? 50}
            />
          </div>
          <Link href="/dashboard/admin/billing/upgrade">
            <Button variant={planSlug === 'free' ? 'default' : 'outline'} size="sm" className="gap-1.5">
              {planSlug === 'free' ? t('plan.upgrade') : t('plan.changePlan')}
              <IconArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="admin-stats-grid">
        {stats.map((stat, idx) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.04, duration: 0.25 }}
          >
          <Link href={stat.link} className="group">
            <Card className={`relative overflow-hidden transition-all duration-200 ring-1 ring-transparent ${stat.accent} hover:shadow-md`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {stat.title}
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-tight">
                      {stat.value}
                    </p>
                    {stat.subtitle && (
                      <p className="mt-1 text-[11px] text-muted-foreground/70">
                        {stat.subtitle}
                      </p>
                    )}
                  </div>
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-[18px] w-[18px] ${stat.iconColor}`} strokeWidth={1.75} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
          </motion.div>
        ))}
      </div>

      {/* Quick Actions — inline row */}
      <div className="mb-8 flex flex-wrap gap-2">
        {quickActions.map((action) => (
          <Link key={action.href} href={action.href}>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              {...(action.id ? { id: action.id } : {})}
            >
              <action.icon className="h-3.5 w-3.5" strokeWidth={2} />
              {action.label}
            </Button>
          </Link>
        ))}
      </div>

      {/* Recent Activity Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconUserPlus className="h-4 w-4 text-muted-foreground" />
                <span>{t('recentActivity.users')}</span>
              </div>
              <Link href="/dashboard/admin/users">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                  {t('recentActivity.viewAll')}
                  <IconArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {recentTenantUsers && recentTenantUsers.length > 0 ? (
                recentTenantUsers.map((tu: any) => (
                  <div
                    key={tu.user_id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(tu.profiles?.full_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm font-medium">{tu.profiles?.full_name || t('recentActivity.unknown')}</p>
                    </div>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {format(new Date(tu.created_at), 'MMM d', { locale: dateLocale })}
                    </p>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <IconUsers className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('recentActivity.noUsers')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCurrencyDollar className="h-4 w-4 text-muted-foreground" />
                <span>{t('recentActivity.transactions')}</span>
              </div>
              <Link href="/dashboard/admin/transactions">
                <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                  {t('recentActivity.viewAll')}
                  <IconArrowUpRight className="h-3 w-3" />
                </Button>
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {transactionsWithUsers && transactionsWithUsers.length > 0 ? (
                transactionsWithUsers.map((transaction) => (
                  <div
                    key={transaction.transaction_id}
                    className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {transaction.user?.full_name || t('recentActivity.unknown')}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground tabular-nums">
                        {new Date(transaction.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="ml-4 text-right">
                      <p className="text-sm font-semibold tabular-nums">
                        {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(transaction.amount)}
                      </p>
                      <Badge
                        variant={
                          transaction.status === 'successful'
                            ? 'default'
                            : transaction.status === 'pending'
                              ? 'secondary'
                              : 'destructive'
                        }
                        className={`text-[9px] ${transaction.status === 'successful'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                          : transaction.status === 'pending'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                            : ''
                          }`}
                      >
                        {t(`recentActivity.status.${transaction.status}`)}
                      </Badge>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <IconCurrencyDollar className="h-5 w-5 text-muted-foreground/60" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('recentActivity.noTransactions')}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
