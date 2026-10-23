import { subscriptionLifecycleApplies, normalizeBillingMode } from '@/lib/billing/billing-mode'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { AiSetupGate } from '@/components/ai/ai-setup-gate'
import { CourseArchitectCta } from '@/components/teacher/course-architect/course-architect-cta'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { AdminDashboardTour } from '@/components/tours/admin-dashboard-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled, isChecklistDismissed, checklistStateKey } from '@/lib/ui-state-keys'
import { getSchoolJoinUrl } from '@/app/actions/admin/invitations'
import { AiKeyBanner } from '@/components/admin/ai/ai-key-banner'
import { getTenantAiEnabled } from '@/lib/ai/ui-flags'
import { computeDelta, foldRevenueWindows } from '@/lib/admin/dashboard-metrics'
import { DashboardHeader } from '@/components/admin/dashboard/dashboard-header'
import { NeedsAttention, type AttentionItem } from '@/components/admin/dashboard/needs-attention'
import { Performance, type MetricRow } from '@/components/admin/dashboard/performance'
import { ActivityFeed, type ActivityEvent } from '@/components/admin/dashboard/activity-feed'
import { ShareSchool } from '@/components/admin/dashboard/share-school'
import { DraftsNudge } from '@/components/admin/dashboard/drafts-nudge'
import { PlanFooter } from '@/components/admin/dashboard/plan-footer'

const DAY_MS = 86_400_000
/**
 * Revenue is folded in JS from the last 60 days of sales. PostgREST caps a
 * response at 1000 rows by default, so the cap is explicit: if it is hit, the
 * page says the figure may be incomplete instead of showing a wrong total.
 */
const REVENUE_ROW_CAP = 5000
const ACTIVITY_PER_SOURCE = 6
const ACTIVITY_MAX = 10

/** Logs a failed query (never swallow it) and hands the result back. */
function checked<T extends { error: { message: string } | null }>(label: string, res: T): T {
  if (res.error) console.error(`[admin-dashboard] ${label} failed:`, res.error.message)
  return res
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.main')
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Get tenant context for all queries
  const tenantId = await getCurrentTenantId()

  const now = new Date()
  const iso = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString()
  const d30 = iso(30 * DAY_MS)
  const d60 = iso(60 * DAY_MS)

  // Every query is scoped to the current tenant and runs in this one round.
  // `exam_submissions`, `community_*` and `payment_requests` all carry tenant_id.
  const [
    members,
    totalCoursesRes,
    publishedCoursesRes,
    draftCoursesRes,
    firstCourseRes,
    readyCourseRes,
    publishedLessonsRes,
    activeSubsRes,
    studentsRes,
    newStudentsRes,
    prevStudentsRes,
    revenueRes,
    lifetimeSalesRes,
    recentSalesRes,
    recentEnrollRes,
    recentMembersRes,
    payReqRes,
    examRes,
    pastDueRes,
    failedRes,
    flagsRes,
    questionsRes,
    settingsRes,
    tenantRes,
    myProfileRes,
    uiState,
    joinUrl,
    aiEnabled,
  ] = await Promise.all([
    supabase.from('tenant_users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    supabase.from('courses').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('courses').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'published').is('deleted_at', null),
    supabase.from('courses').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'draft').is('deleted_at', null),
    // The oldest course with its lesson count: where the "first course" step
    // sends the owner next (quick create, or that course's lesson editor).
    supabase
      .from('courses')
      .select('course_id, title, status, lessons(id)')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1),
    // The first course a student can actually open: published, with at least
    // one published lesson (#675). This is what completes the step and what
    // the milestone card links to.
    supabase
      .from('courses')
      .select('course_id, title, lessons!inner(id)')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .eq('status', 'published')
      .eq('lessons.status', 'published')
      .order('created_at', { ascending: true })
      .limit(1),
    // Any published lesson at all — the second sub-step.
    supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'published'),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('subscription_status', 'active'),
    supabase.from('tenant_users').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('role', 'student').eq('status', 'active'),
    // `tenant_users` stamps membership with `joined_at` (it has no created_at).
    supabase.from('tenant_users').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('role', 'student').eq('status', 'active').gte('joined_at', d30),
    supabase.from('tenant_users').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('role', 'student').eq('status', 'active')
      .gte('joined_at', d60).lt('joined_at', d30),
    supabase.from('transactions').select('amount, refunded_amount, transaction_date')
      .eq('tenant_id', tenantId).eq('status', 'successful').gte('transaction_date', d60)
      .order('transaction_date', { ascending: false }).limit(REVENUE_ROW_CAP),
    supabase.from('transactions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'successful'),
    supabase.from('transactions').select('transaction_id, amount, transaction_date, user_id')
      .eq('tenant_id', tenantId).eq('status', 'successful')
      .order('transaction_date', { ascending: false }).limit(ACTIVITY_PER_SOURCE),
    supabase.from('enrollments').select('enrollment_id, user_id, course_id, enrollment_date')
      .eq('tenant_id', tenantId).not('enrollment_date', 'is', null)
      .order('enrollment_date', { ascending: false }).limit(ACTIVITY_PER_SOURCE),
    supabase.from('tenant_users').select('user_id, joined_at, role')
      .eq('tenant_id', tenantId).eq('status', 'active').not('joined_at', 'is', null)
      .order('joined_at', { ascending: false }).limit(ACTIVITY_PER_SOURCE),
    // Needs attention — head counts only.
    supabase.from('payment_requests').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).in('status', ['pending', 'contacted', 'payment_received']),
    supabase.from('exam_submissions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).or('review_status.eq.pending_teacher_review,requires_attention.eq.true'),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('subscription_status', 'past_due'),
    supabase.from('transactions').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'failed').gte('transaction_date', d30),
    supabase.from('community_flags').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('status', 'pending'),
    supabase.from('community_posts').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('post_type', 'question').is('accepted_comment_id', null).eq('is_hidden', false),
    supabase.from('tenant_settings').select('setting_key, setting_value')
      .eq('tenant_id', tenantId)
      .in('setting_key', ['site_name', 'theme_preset', 'logo_url', 'manual_payment_instructions']),
    supabase.from('tenants').select('plan, stripe_account_id, billing_mode').eq('id', tenantId).single(),
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    getUiState(userId),
    getSchoolJoinUrl(),
    getTenantAiEnabled(),
  ])

  const totalUsers = checked('members count', members).count
  const totalCourses = checked('courses count', totalCoursesRes).count
  const publishedCourses = checked('published courses count', publishedCoursesRes).count
  const draftCourses = checked('draft courses count', draftCoursesRes).count
  const firstCourseRows = checked('first course', firstCourseRes).data
  const readyCourseRows = checked('ready course', readyCourseRes).data
  const publishedLessons = checked('published lessons count', publishedLessonsRes).count
  const activeSubscriptions = checked('active subscriptions count', activeSubsRes).count
  const studentCount = checked('students count', studentsRes).count
  const newStudents = checked('new students count', newStudentsRes)
  const prevStudents = checked('previous students count', prevStudentsRes)
  const revenueQuery = checked('revenue window', revenueRes)
  const lifetimeSales = checked('lifetime sales count', lifetimeSalesRes).count
  const tenant = checked('tenant', tenantRes).data
  const settingsRows = checked('tenant settings', settingsRes).data
  checked('own profile', myProfileRes)

  // --- Revenue + metrics -------------------------------------------------
  const revenueRows = revenueQuery.data ?? []
  const truncated = revenueRows.length >= REVENUE_ROW_CAP
  const windows = foldRevenueWindows(revenueRows, now, 30)
  const revenue = {
    current: revenueQuery.error ? null : windows.current,
    previous: windows.previous,
    delta: computeDelta(windows.current, windows.previous),
    series: windows.series,
    truncated,
    rowCap: REVENUE_ROW_CAP,
    lifetimeSales: lifetimeSales ?? 0,
  }

  const metrics: MetricRow[] = [
    {
      key: 'newStudents',
      value: newStudents.error ? null : (newStudents.count ?? 0),
      delta: newStudents.error || prevStudents.error
        ? undefined
        : computeDelta(newStudents.count ?? 0, prevStudents.count ?? 0),
      href: '/dashboard/admin/users',
      testId: 'admin-stat-new-students',
    },
    {
      key: 'members',
      value: members.error ? null : (totalUsers ?? 0),
      href: '/dashboard/admin/users',
      testId: 'admin-stat-users',
    },
    {
      key: 'courses',
      value: totalCoursesRes.error ? null : (totalCourses ?? 0),
      detail: publishedCoursesRes.error ? undefined : t('performance.coursesDetail', { count: publishedCourses ?? 0 }),
      href: '/dashboard/admin/courses',
      testId: 'admin-stat-courses',
    },
    {
      key: 'activeSubscriptions',
      value: activeSubsRes.error ? null : (activeSubscriptions ?? 0),
      href: '/dashboard/admin/subscriptions',
      testId: 'admin-stat-subscriptions',
    },
  ]

  // --- Needs attention ---------------------------------------------------
  const attentionSources: Array<{ item: AttentionItem; label: string; res: { error: { message: string } | null; count: number | null } }> = [
    { label: 'payment requests', res: payReqRes, item: { key: 'paymentRequests', count: 0, href: '/dashboard/admin/payment-requests', testId: 'admin-stat-pending-payments' } },
    // No school-wide submissions list exists; the teacher course list is the entry point.
    { label: 'exam submissions', res: examRes, item: { key: 'examSubmissions', count: 0, href: '/dashboard/teacher/courses' } },
    { label: 'past due subscriptions', res: pastDueRes, item: { key: 'pastDue', count: 0, href: '/dashboard/admin/subscriptions' } },
    { label: 'failed payments', res: failedRes, item: { key: 'failedPayments', count: 0, href: '/dashboard/admin/transactions' } },
    { label: 'community flags', res: flagsRes, item: { key: 'flags', count: 0, href: '/dashboard/admin/community/moderation' } },
    { label: 'unanswered questions', res: questionsRes, item: { key: 'questions', count: 0, href: '/dashboard/admin/community' } },
  ]
  const attentionItems = attentionSources.map(({ item, res, label }) => ({
    ...item,
    count: checked(label, res).count ?? 0,
  }))
  const attentionError = attentionSources.some((s) => s.res.error)

  // --- Second round: names (profiles) + course titles + plan -------------
  const recentSales = checked('recent sales', recentSalesRes).data ?? []
  const recentEnrollments = checked('recent enrollments', recentEnrollRes).data ?? []
  const recentMembers = checked('recent members', recentMembersRes).data ?? []

  const profileIds = [
    ...new Set(
      [userId, ...recentSales.map((r) => r.user_id), ...recentEnrollments.map((r) => r.user_id), ...recentMembers.map((r) => r.user_id)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ]
  const courseIds = [...new Set(recentEnrollments.map((r) => r.course_id))]
  const planSlug = tenant?.plan || 'free'

  const [profilesRes, courseTitlesRes, planRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name').in('id', profileIds),
    courseIds.length > 0
      ? supabase.from('courses').select('course_id, title').eq('tenant_id', tenantId).in('course_id', courseIds)
      : Promise.resolve({ data: [] as Array<{ course_id: number; title: string }>, error: null }),
    supabase.from('platform_plans').select('name, limits').eq('slug', planSlug).eq('is_active', true).single(),
  ])
  const profiles = checked('activity profiles', profilesRes)
  const courseTitles = checked('activity course titles', courseTitlesRes)
  const platformPlan = checked('platform plan', planRes).data

  const nameById = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name as string | null]))
  const titleById = new Map((courseTitles.data ?? []).map((c) => [c.course_id, c.title]))
  const firstName = nameById.get(userId)?.trim().split(/\s+/)[0] || null

  const activityError = Boolean(
    recentSalesRes.error || recentEnrollRes.error || recentMembersRes.error || profilesRes.error || courseTitlesRes.error,
  )
  const events: ActivityEvent[] = [
    ...recentEnrollments.map((r): ActivityEvent => ({
      id: `e-${r.enrollment_id}`,
      kind: 'enrolled',
      at: r.enrollment_date as string,
      name: nameById.get(r.user_id) ?? null,
      course: titleById.get(r.course_id) ?? null,
    })),
    ...recentSales.map((r): ActivityEvent => ({
      id: `t-${r.transaction_id}`,
      kind: 'paid',
      at: r.transaction_date,
      name: r.user_id ? (nameById.get(r.user_id) ?? null) : null,
      amount: r.amount,
    })),
    ...recentMembers.map((r): ActivityEvent => ({
      id: `m-${r.user_id}`,
      kind: 'joined',
      at: r.joined_at as string,
      name: nameById.get(r.user_id) ?? null,
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, ACTIVITY_MAX)

  // --- Onboarding inputs -------------------------------------------------
  const billingMode = normalizeBillingMode((tenant as { billing_mode?: unknown } | null)?.billing_mode)
  // A missing key (or the internal billing mode) means unlimited, as in lib/billing/plan-limits.ts.
  // No plan row at all falls back to the Free defaults.
  const planLimits = platformPlan
    ? (platformPlan.limits as { max_courses?: number; max_students?: number } | null)
    : { max_courses: 5, max_students: 50 }
  const unlimitedByMode = billingMode === 'internal'

  const settingsByKey = new Map((settingsRows || []).map(s => [s.setting_key, s.setting_value]))
  const siteNameValue = (settingsByKey.get('site_name') as { value?: unknown } | undefined)?.value
  const schoolName = typeof siteNameValue === 'string' && siteNameValue.trim() ? siteNameValue.trim() : null
  const hasBranding = settingsByKey.has('theme_preset') || settingsByKey.has('logo_url')
  const isStripeConnected = Boolean(tenant?.stripe_account_id)
  const hasConfiguredPayments = isStripeConnected || settingsByKey.has('manual_payment_instructions')
  const firstCourse = firstCourseRows?.[0]
  const firstCourseLessonCount = firstCourse?.lessons?.length ?? 0
  const firstReadyCourse = readyCourseRows?.[0]
  const hasPublishedCourse = (publishedCourses || 0) > 0
  const hasPublishedLesson = (publishedLessons || 0) > 0
  const hasOpenableCourse = Boolean(firstReadyCourse)
  // Where "Create your first course" points, by state: nothing yet → quick
  // create; a course with no lesson → its lesson editor; otherwise the course.
  const firstCourseHref = !firstCourse
    ? '/dashboard/admin/courses/new'
    : firstCourseLessonCount === 0
      ? `/dashboard/teacher/courses/${firstCourse.course_id}/lessons/new?from=new-course`
      : `/dashboard/teacher/courses/${firstCourse.course_id}`

  let siteUrl = '/'
  try {
    siteUrl = new URL(joinUrl).origin
  } catch {
    // Relative or malformed join URL: fall back to this site's root.
  }

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="admin-dashboard">
      <DashboardHeader firstName={firstName} schoolName={schoolName} />

      {/* Guided Tour (client component) */}
      <AdminDashboardTour
        userId={userId}
        completed={isTourCompleted(uiState, 'admin-dashboard')}
        toursEnabled={areToursEnabled(uiState)}
      />

      {!aiEnabled && <AiKeyBanner />}

      {(totalCourses ?? 0) === 0 && <AiSetupGate><CourseArchitectCta /></AiSetupGate>}

      {/* Open work comes first: it is the reason an admin opens this page */}
      <NeedsAttention items={attentionItems} hadError={attentionError} />

      {/* Getting Started Checklist — prominent for new users */}
      <div data-tour="admin-checklist">
      <OnboardingChecklist
        storageKey={`admin-${userId}`}
        stateKey={checklistStateKey('admin')}
        dismissed={isChecklistDismissed(uiState, 'admin')}
        title={t('onboarding.title')}
        subtitle={t('onboarding.subtitle')}
        milestone={firstReadyCourse ? {
          stepId: 'add-course',
          title: t('onboarding.courseSuccessTitle'),
          description: t('onboarding.courseSuccessDescription', {
            course: firstReadyCourse.title,
          }),
          href: `/courses/${firstReadyCourse.course_id}`,
          copyLabel: t('onboarding.copyCourseLink'),
          copiedLabel: t('onboarding.courseLinkCopied'),
          viewLabel: t('onboarding.viewCourse'),
        } : undefined}
        steps={[
          {
            id: 'add-course',
            label: t('onboarding.addCourse'),
            description: t('onboarding.addCourseDesc'),
            href: firstCourseHref,
            // A course counts once a student can open something in it: the
            // course is published AND has a published lesson (#675).
            completed: hasOpenableCourse,
            timeHint: t('onboarding.addCourseTime'),
            substeps: [
              {
                id: 'publish-course',
                label: t('onboarding.addCourseStepPublish'),
                completed: hasPublishedCourse,
              },
              {
                id: 'publish-lesson',
                label: t('onboarding.addCourseStepLesson'),
                completed: hasPublishedLesson,
              },
            ],
          },
          {
            // Right after the course: a live course with nobody in it is the
            // state the prod sandbox got stuck in (#675). Payments and
            // branding are optional; a first student is the point.
            id: 'invite-users',
            label: t('onboarding.inviteUsers'),
            description: t('onboarding.inviteUsersDesc'),
            href: '/dashboard/admin/users',
            completed: (totalUsers || 0) > 1, // More than just the admin
            timeHint: t('onboarding.inviteUsersTime'),
            share: {
              url: joinUrl,
              copyLabel: t('onboarding.copyJoinLink'),
              copiedLabel: t('onboarding.joinLinkCopied'),
              whatsappLabel: t('onboarding.shareWhatsApp'),
              whatsappText: t('onboarding.inviteWhatsAppMessage', { url: joinUrl }),
            },
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
            id: 'configure-school',
            label: t('onboarding.configureSchool'),
            description: t('onboarding.configureSchoolDesc'),
            href: '/dashboard/admin/settings',
            completed: Boolean(siteNameValue),
            timeHint: t('onboarding.configureSchoolTime'),
          },
        ]}
        footer={
          <p className="text-xs text-muted-foreground">
            {t('onboarding.wizardPrompt')}{' '}
            <Link
              href="/onboarding"
              className="font-medium text-brand-text underline-offset-4 hover:underline"
            >
              {t('onboarding.wizardLink')}
            </Link>
          </p>
        }
      />
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-8">
          <Performance
            locale={locale}
            revenue={revenue}
            metrics={metrics}
            hasConfiguredPayments={hasConfiguredPayments}
            hasPublishedCourse={hasPublishedCourse}
          />
          <ActivityFeed locale={locale} events={events} hadError={activityError} />
        </div>
        <aside className="space-y-4 lg:col-span-4">
          <ShareSchool
            joinUrl={joinUrl}
            siteUrl={siteUrl}
            whatsappText={t('onboarding.inviteWhatsAppMessage', { url: joinUrl })}
          />
          <DraftsNudge count={draftCourses ?? 0} />
        </aside>
      </div>

      <PlanFooter
        planName={platformPlan?.name || 'Free'}
        planSlug={planSlug}
        courses={totalCourses || 0}
        students={studentCount || 0}
        maxCourses={unlimitedByMode ? -1 : (planLimits?.max_courses ?? -1)}
        maxStudents={unlimitedByMode ? -1 : (planLimits?.max_students ?? -1)}
        lifecycleApplies={subscriptionLifecycleApplies(billingMode)}
      />
    </div>
  )
}
