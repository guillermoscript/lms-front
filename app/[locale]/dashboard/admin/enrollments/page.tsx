import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getSessionUser } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EnrollmentsTable } from '@/components/admin/enrollments-table'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
import { fetchAuthEmails } from '@/lib/supabase/auth-emails'
import { IconCertificate, IconCheck, IconClock } from '@tabler/icons-react'

export default async function AdminEnrollmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  await params
  const t = await getTranslations('dashboard.admin.enrollments')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Every enrollment, paged and count-verified: PostgREST silently caps a plain
  // select at 1000 rows, which would truncate the table AND the stat cards below.
  const enrollments = await fetchAllRows('enrollments', (from, to) =>
    supabase
      .from('enrollments')
      .select('enrollment_id, user_id, course_id, status, enrollment_date', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('enrollment_date', { ascending: false })
      .order('enrollment_id')
      .range(from, to),
  )

  // Get user profiles, courses, and emails in parallel.
  // Filter nulls + dedupe first: a null id makes PostgREST reject the whole query
  // (every cell → "Unknown"). `.in()` lookups are chunked (URL length) and paged.
  const userIds = [...new Set(enrollments.map((e) => e.user_id).filter(Boolean))]
  const courseIds = [...new Set(enrollments.map((e) => e.course_id).filter(Boolean))]

  const [profiles, courses, emailMap] = await Promise.all([
    fetchAllRowsIn('profiles', userIds, (chunk, from, to) =>
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url', { count: 'exact' })
        .in('id', chunk)
        .order('id')
        .range(from, to),
    ),
    fetchAllRowsIn('courses', courseIds, (chunk, from, to) =>
      supabase
        .from('courses')
        .select('course_id, title', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .in('course_id', chunk)
        .order('course_id')
        .range(from, to),
    ),
    fetchAuthEmails(supabase, userIds),
  ])

  const usersMap = new Map(profiles.map((u) => [u.id, { ...u, email: emailMap.get(u.id) || '' }]))
  const coursesMap = new Map(courses.map((c) => [c.course_id, c]))

  const activeCount = enrollments.filter((e) => e.status === 'active').length
  const completedCount = enrollments.filter((e) => e.status === 'completed').length

  return (
    <div className="min-h-screen bg-background" data-testid="enrollments-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('enrollments') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto container px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{enrollments.length}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
                  <IconCertificate className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.active')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{activeCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <IconClock className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.completed')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{completedCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
                  <IconCheck className="h-[18px] w-[18px]" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enrollments Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <EnrollmentsTable
              enrollments={enrollments.map((enrollment) => {
                const profile = usersMap.get(enrollment.user_id)
                const course = coursesMap.get(enrollment.course_id)
                return {
                  id: enrollment.enrollment_id,
                  courseId: enrollment.course_id,
                  studentName: profile?.full_name ?? null,
                  email: profile?.email ?? '',
                  avatarUrl: profile?.avatar_url ?? null,
                  courseTitle: course?.title ?? null,
                  status: enrollment.status,
                  enrolledAt: enrollment.enrollment_date,
                }
              })}
            />
          </CardContent>
        </Card>
      </main>
    </div >
  )
}
