import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Button } from '@/components/ui/button'
import { RevenueChart } from '@/components/admin/revenue-chart'
import { UserGrowthChart } from '@/components/admin/user-growth-chart'
import { EngagementMetrics } from '@/components/admin/engagement-metrics'
import { CoursePopularityChart } from '@/components/admin/course-popularity-chart'
import { ExportButton } from '@/components/admin/export-button'
import Link from 'next/link'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getTranslations } from 'next-intl/server'
import { getAnalyticsTier, getTenantPlan } from '@/lib/plans/server'
import { UpgradeNudge } from '@/components/shared/upgrade-nudge'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { netOfRefunds } from '@/lib/payments/payouts-owed'

interface SearchParams {
  period?: string
}

/**
 * The two embedded shapes PostgREST returns below. They are written out rather
 * than inferred because the admin client is untyped — and because an embed that
 * names a column the table does not have is how three figures on this page
 * silently read 0 (#716 §2, #547 §2).
 */
interface EnrollmentWithProgress {
  enrollment_id: number
  user_id: string
  course: { course_id: number; lessons: { count: number }[] } | null
}

interface CourseWithEnrollments {
  course_id: number
  title: string
  enrollments: { count: number }[] | null
  lessons: { id: number }[] | null
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<SearchParams>
}) {
  const { locale } = await params
  const resolvedSearchParams = await searchParams
  const t = await getTranslations('dashboard.admin.analytics')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  const tenantId = await getCurrentTenantId()

  // Analytics tiers (#662, PRODUCT.md "Plan tiers"): none on Free → nudge;
  // basic on Starter → growth, engagement and course popularity; advanced on
  // Pro+ adds revenue reporting and CSV export.
  const analyticsTier = await getAnalyticsTier(tenantId)
  if (analyticsTier === 'none') {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6" data-testid="admin-analytics-page">
        <AdminBreadcrumb
          items={[
            { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
            { label: tBreadcrumbs('analytics') },
          ]}
        />
        <UpgradeNudge feature="analytics" currentPlan={(await getTenantPlan(tenantId)).slug} />
      </div>
    )
  }
  const advancedAnalytics = analyticsTier === 'advanced'

  // Get period from query params (default: 30 days)
  const period = resolvedSearchParams.period || '30'
  const daysAgo = parseInt(period)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysAgo)

  // Active students (users with activity in last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  // Parallelize all independent data queries
  const [
    { data: transactions, error: transactionsError },
    { data: tenantUserIds },
    { count: totalUsers },
    { count: totalEnrollments },
    { data: activeStudentIds, error: activeStudentsError },
    { count: totalLessonCompletions, error: lessonCompletionsError },
    { count: totalExamSubmissions },
    { data: enrollmentsWithProgress },
    { data: coursesWithEnrollments },
  ] = await Promise.all([
    // The column is `transaction_date`; `transactions` has no `created_at`.
    // Asking for one made PostgREST reject the whole request, and because the
    // error was never read this page rendered $0.00 revenue and a count of 0 on
    // every load, for every school, permanently and silently (#547 §2).
    supabase.from('transactions').select('amount, refunded_amount, status, transaction_date')
      .eq('tenant_id', tenantId).eq('status', 'successful')
      .gte('transaction_date', startDate.toISOString()).order('transaction_date', { ascending: true }),
    supabase.from('tenant_users').select('user_id, created_at')
      .eq('tenant_id', tenantId).eq('status', 'active')
      .gte('created_at', startDate.toISOString()).order('created_at', { ascending: true }),
    supabase.from('tenant_users').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('enrollments').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    // `lesson_completions` has NO `tenant_id` (docs/DATABASE_SCHEMA.md); the
    // school it belongs to is the one that owns the LESSON. Filtering the
    // completion row by a column it does not have made PostgREST reject both
    // requests with 42703, and — the errors going unread, exactly as in the
    // revenue case above — every school saw `0` active students and `0` lesson
    // completions on this page, always (#716 §2). The `!inner` embed is the
    // tenant scope: it joins `lessons` and drops any completion whose lesson
    // belongs to another school, without an id list to chunk (#548).
    supabase.from('lesson_completions').select('user_id, lesson:lessons!inner(tenant_id)')
      .eq('lesson.tenant_id', tenantId).gte('completed_at', thirtyDaysAgo.toISOString()),
    supabase.from('lesson_completions').select('lesson:lessons!inner(tenant_id)', { count: 'exact', head: true })
      .eq('lesson.tenant_id', tenantId),
    supabase.from('exam_submissions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    // `user_id` is selected because the completion count below filters on it.
    // Without it every enrollment asked PostgREST for `user_id=eq.undefined`,
    // so the average completion rate was 0% for every school (#716 §2).
    supabase.from('enrollments').select(`
      enrollment_id,
      user_id,
      course:courses (
        course_id,
        lessons:lessons (count)
      )
    `).eq('tenant_id', tenantId),
    // `lessons` is keyed by `id`, not `lesson_id`. Embedding a column that does
    // not exist rejected this request outright, so `coursesWithEnrollments` was
    // null and the course-popularity chart was empty for every school (#716 §2).
    supabase.from('courses').select(`
      course_id,
      title,
      enrollments:enrollments (count),
      lessons:lessons (
        id
      )
    `).eq('tenant_id', tenantId).eq('status', 'published'),
  ])

  // Fail loudly rather than rendering zeros. Every revenue figure below is a sum
  // over `transactions`, so a rejected query is indistinguishable from a school
  // that has never sold anything — which is exactly how the `created_at` bug
  // above stayed invisible (#547 §2).
  if (transactionsError) {
    throw new Error(`Analytics revenue query failed: ${transactionsError.message}`)
  }
  // Same rule for the engagement figures: a rejected query and a school whose
  // students have completed nothing both render `0`, and that is how the
  // tenant-filter bug above survived a "page loads" test (#716 §2).
  if (activeStudentsError) {
    throw new Error(`Analytics active-students query failed: ${activeStudentsError.message}`)
  }
  if (lessonCompletionsError) {
    throw new Error(`Analytics lesson-completions query failed: ${lessonCompletionsError.message}`)
  }

  // Group revenue by date
  const revenueByDate = new Map<string, { revenue: number; transactions: number }>()
  let totalRevenue = 0

  transactions?.forEach((t) => {
    const date = format(new Date(t.transaction_date), 'MMM d', { locale: dateLocale })
    const existing = revenueByDate.get(date) || { revenue: 0, transactions: 0 }
    // Net of any refunded slice (#547) — a partially refunded sale is still
    // `successful`, so counting it in full would overstate revenue.
    const kept = netOfRefunds(t.amount || 0, t.refunded_amount)
    revenueByDate.set(date, {
      revenue: existing.revenue + kept,
      transactions: existing.transactions + 1,
    })
    totalRevenue += kept
  })

  const revenueData = Array.from(revenueByDate.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    transactions: data.transactions,
  }))

  // Calculate user growth data
  const profiles = tenantUserIds?.map((tu) => ({ created_at: tu.created_at })) || []

  const usersByDate = new Map<string, number>()
  let runningTotal = (totalUsers || 0) - (profiles?.length || 0)

  profiles?.forEach((p) => {
    const date = format(new Date(p.created_at), 'MMM d', { locale: dateLocale })
    const existing = usersByDate.get(date) || 0
    usersByDate.set(date, existing + 1)
  })

  const userGrowthData = Array.from(usersByDate.entries()).map(([date, newUsers]) => {
    runningTotal += newUsers
    return {
      date,
      newUsers,
      totalUsers: runningTotal,
    }
  })

  const activeStudents = new Set(activeStudentIds?.map((s) => s.user_id)).size

  // Calculate average completion rate
  let totalCompletionRate = 0
  let validEnrollments = 0

  if (enrollmentsWithProgress) {
    for (const enrollment of enrollmentsWithProgress as unknown as EnrollmentWithProgress[]) {
      const course = enrollment.course
      if (!course?.lessons?.[0]?.count) continue

      const totalLessons = course.lessons[0].count
      if (totalLessons === 0) continue

      const { count: completedLessons } = await supabase
        .from('lesson_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', enrollment.user_id)
        .in(
          'lesson_id',
          (
            await supabase
              .from('lessons')
              .select('id')
              .eq('course_id', course.course_id)
          ).data?.map((l) => l.id) || []
        )

      const completionRate = (completedLessons || 0) / totalLessons
      totalCompletionRate += completionRate
      validEnrollments++
    }
  }

  const averageCompletionRate =
    validEnrollments > 0 ? (totalCompletionRate / validEnrollments) * 100 : 0

  const coursePopularityData = await Promise.all(
    ((coursesWithEnrollments || []) as unknown as CourseWithEnrollments[]).map(async (course) => {
      const enrollmentCount = course.enrollments?.[0]?.count || 0
      const lessonIds = course.lessons?.map((l) => l.id) || []

      if (lessonIds.length === 0) {
        return {
          courseId: course.course_id,
          title: course.title,
          enrollments: enrollmentCount,
          completionRate: 0,
        }
      }

      // Get enrollments for this course
      const { data: courseEnrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('course_id', course.course_id)

      if (!courseEnrollments || courseEnrollments.length === 0) {
        return {
          courseId: course.course_id,
          title: course.title,
          enrollments: 0,
          completionRate: 0,
        }
      }

      // Calculate completion rate for this course
      let totalCompletions = 0
      for (const enrollment of courseEnrollments) {
        const { count: completedCount } = await supabase
          .from('lesson_completions')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', enrollment.user_id)
          .in('lesson_id', lessonIds)

        totalCompletions += (completedCount || 0) / lessonIds.length
      }

      const completionRate =
        courseEnrollments.length > 0
          ? (totalCompletions / courseEnrollments.length) * 100
          : 0

      return {
        courseId: course.course_id,
        title: course.title,
        enrollments: enrollmentCount,
        completionRate,
      }
    })
  )

  coursePopularityData.sort((a, b) => b.enrollments - a.enrollments)

  const periodKeys: Record<string, string> = { '7': 'last7days', '30': 'last30days', '90': 'last90days', '365': 'lastYear' }
  const periodLabel = t(`periodLabels.${periodKeys[period] || 'generic'}`, { days: period })

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="analytics-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('analytics') },
        ]}
      />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <div className="flex items-center gap-2">
          {advancedAnalytics && (
            <ExportButton
              data={{
                revenueData,
                userGrowthData,
                coursePopularityData,
                metrics: {
                  totalRevenue,
                  totalUsers: totalUsers || 0,
                  totalEnrollments: totalEnrollments || 0,
                  activeStudents,
                  averageCompletionRate,
                },
              }}
              period={period}
            />
          )}
          <div className="flex gap-1">
            {(['7', '30', '90', '365'] as const).map((p) => (
              <Link key={p} href={`?period=${p}`}>
                <Button variant={period === p ? 'default' : 'outline'} size="sm" className="text-xs">
                  {t(`periods.${p === '365' ? '1year' : `${p}days`}`)}
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {advancedAnalytics ? (
        <RevenueChart
          data={revenueData}
          totalRevenue={totalRevenue}
          period={periodLabel}
        />
      ) : (
        <UpgradeNudge feature="analytics" hint="analyticsBasic" compact data-testid="analytics-basic-nudge" />
      )}

      <UserGrowthChart
        data={userGrowthData}
        totalUsers={totalUsers || 0}
        period={periodLabel}
      />

      <EngagementMetrics
        totalEnrollments={totalEnrollments || 0}
        activeStudents={activeStudents}
        averageCompletionRate={averageCompletionRate}
        totalLessonCompletions={totalLessonCompletions || 0}
        totalExamSubmissions={totalExamSubmissions || 0}
      />

      <CoursePopularityChart data={coursePopularityData} />
    </div>
  )
}
