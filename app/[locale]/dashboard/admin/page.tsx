import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconUsers,
  IconBook,
  IconCurrencyDollar,
  IconReceipt,
  IconCrown,
  IconArrowUpRight,
  IconUserPlus,
} from '@tabler/icons-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { UsageMeter } from '@/components/admin/usage-meter'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { AdminDashboardTour } from '@/components/tours/admin-dashboard-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled, isChecklistDismissed, checklistStateKey } from '@/lib/ui-state-keys'

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.main')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Get tenant context for all queries
  const tenantId = await getCurrentTenantId()

  // Get platform statistics — ALL queries scoped to current tenant
  const [
    { count: totalUsers },
    { count: totalCourses },
    { count: publishedCourses, data: publishedCourseRows },
    { count: totalEnrollments },
    { count: totalTransactions },
    { count: pendingPaymentRequests },
    { count: activeSubscriptions },
    { data: recentTransactions },
    { data: recentTenantUsers },
    uiState,
  ] = await Promise.all([
    supabase.from('tenant_users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('courses').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase
      .from('courses')
      .select('course_id, title', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .order('created_at', { ascending: true })
      .limit(1),
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
    getUiState(userId),
  ])

  // Supabase infers the profiles(...) embed as an array even though the FK
  // makes it a single row — narrow it to what the query actually returns.
  const recentUsers = (recentTenantUsers || []) as unknown as Array<{
    user_id: string
    created_at: string
    profiles: { id: string; full_name: string | null } | null
  }>

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

  // Parallelize post-stats queries
  const adminClient = createAdminClient()
  const [
    { data: successfulTransactions },
    { data: tenant },
    { count: studentCount },
    { data: onboardingSettings },
  ] = await Promise.all([
    supabase.from('transactions').select('amount')
      .eq('tenant_id', tenantId).eq('status', 'successful'),
    adminClient.from('tenants').select('plan, stripe_account_id')
      .eq('id', tenantId).single(),
    adminClient.from('tenant_users').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('role', 'student').eq('status', 'active'),
    supabase.from('tenant_settings').select('setting_key, setting_value')
      .eq('tenant_id', tenantId)
      .in('setting_key', ['site_name', 'theme_preset', 'logo_url', 'manual_payment_instructions']),
  ])

  const totalRevenue =
    successfulTransactions?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0

  // platformPlan depends on tenant.plan -- must be sequential
  const planSlug = tenant?.plan || 'free'
  const { data: platformPlan } = await adminClient
    .from('platform_plans')
    .select('name, limits')
    .eq('slug', planSlug)
    .eq('is_active', true)
    .single()
  const planLimits = (platformPlan?.limits as { max_courses?: number; max_students?: number }) || { max_courses: 5, max_students: 50 }

  const settingsByKey = new Map(
    (onboardingSettings || []).map(s => [s.setting_key, s.setting_value])
  )
  const currentSettings = { site_name: settingsByKey.get('site_name') }
  const hasBranding = settingsByKey.has('theme_preset') || settingsByKey.has('logo_url')
  const isStripeConnected = Boolean(tenant?.stripe_account_id)
  const hasConfiguredPayments = isStripeConnected || settingsByKey.has('manual_payment_instructions')
  const firstPublishedCourse = publishedCourseRows?.[0]

  const stats = [
    {
      title: t('stats.totalUsers'),
      value: totalUsers || 0,
      icon: IconUsers,
      link: '/dashboard/admin/users',
    },
    {
      title: t('stats.activeSubscriptions'),
      value: activeSubscriptions || 0,
      icon: IconCrown,
      link: '/dashboard/admin/subscriptions',
    },
    {
      title: t('stats.totalCourses'),
      value: totalCourses || 0,
      subtitle: t('stats.published', { count: publishedCourses || 0 }),
      icon: IconBook,
      link: '/dashboard/admin/courses',
    },
    {
      title: t('stats.pendingPayments'),
      value: pendingPaymentRequests || 0,
      icon: IconReceipt,
      link: '/dashboard/admin/payment-requests',
    },
    {
      title: t('stats.totalRevenue'),
      value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(totalRevenue),
      subtitle: t('stats.transactions', { count: totalTransactions || 0 }),
      icon: IconCurrencyDollar,
      link: '/dashboard/admin/transactions',
    },
  ]

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="admin-dashboard">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin') },
        ]}
      />

      {/* Guided Tour (client component) */}
      <AdminDashboardTour
        userId={userId}
        completed={isTourCompleted(uiState, 'admin-dashboard')}
        toursEnabled={areToursEnabled(uiState)}
      />

      {/* Getting Started Checklist — prominent for new users */}
      <div data-tour="admin-checklist">
      <OnboardingChecklist
        storageKey={`admin-${userId}`}
        stateKey={checklistStateKey('admin')}
        dismissed={isChecklistDismissed(uiState, 'admin')}
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        milestone={firstPublishedCourse ? {
          stepId: 'add-course',
          title: t('onboarding.courseSuccessTitle'),
          description: t('onboarding.courseSuccessDescription', {
            course: firstPublishedCourse.title,
          }),
          href: `/courses/${firstPublishedCourse.course_id}`,
          copyLabel: t('onboarding.copyCourseLink'),
          copiedLabel: t('onboarding.courseLinkCopied'),
          viewLabel: t('onboarding.viewCourse'),
        } : undefined}
        steps={[
          {
            id: 'add-course',
            label: t('onboarding.addCourse'),
            description: t('onboarding.addCourseDesc'),
            href: '/dashboard/admin/products/new',
            completed: (publishedCourses || 0) > 0,
            timeHint: t('onboarding.addCourseTime'),
          },
          {
            id: 'connect-payments',
            label: t('onboarding.connectPayments'),
            description: t('onboarding.connectPaymentsDesc'),
            href: '/dashboard/admin/settings?tab=payment',
            completed: hasConfiguredPayments,
            timeHint: t('onboarding.connectPaymentsTime'),
          },
          {
            id: 'brand-school',
            label: t('onboarding.brandSchool'),
            description: t('onboarding.brandSchoolDesc'),
            href: '/dashboard/admin/appearance',
            completed: hasBranding,
            timeHint: t('onboarding.brandSchoolTime'),
          },
          {
            id: 'invite-users',
            label: t('onboarding.inviteUsers'),
            description: t('onboarding.inviteUsersDesc'),
            href: '/dashboard/admin/users',
            completed: (totalUsers || 0) > 1, // More than just the admin
            timeHint: t('onboarding.inviteUsersTime'),
          },
          {
            id: 'configure-school',
            label: t('onboarding.configureSchool'),
            description: t('onboarding.configureSchoolDesc'),
            href: '/dashboard/admin/settings',
            completed: Boolean(currentSettings?.site_name),
            timeHint: t('onboarding.configureSchoolTime'),
          },
        ]}
        footer={
          <p className="text-xs text-muted-foreground">
            {t('onboarding.wizardPrompt')}{' '}
            <Link
              href="/onboarding"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {t('onboarding.wizardLink')}
            </Link>
          </p>
        }
      />
      </div>

      {/* Plan & Usage — compact inline bar */}
      <div data-tour="admin-plan" className="flex flex-col gap-4 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">
            {platformPlan?.name || 'Free'} {t('plan.label')}
          </span>
          <Badge
            variant={planSlug === 'free' ? 'secondary' : 'default'}
            className="text-[10px] uppercase tracking-wider"
          >
            {planSlug === 'free' ? t('plan.current') : t('plan.active')}
          </Badge>
        </div>
        <div className="flex flex-1 items-center gap-6 sm:max-w-sm">
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

      {/* Stats Grid — clean, no color noise */}
      <div data-tour="admin-stats" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" data-testid="admin-stats-grid">
        {stats.map((stat) => (
          <Link key={stat.title} href={stat.link} className="group">
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <stat.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
                </div>
                <p className="mt-3 text-2xl font-bold tracking-tight">
                  {stat.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stat.title}
                </p>
                {stat.subtitle && (
                  <p className="text-[11px] text-muted-foreground/60">
                    {stat.subtitle}
                  </p>
                )}
              </CardContent>
            </Card>
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
              {recentUsers.length > 0 ? (
                recentUsers.map((tu) => (
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
    </div>
  )
}
