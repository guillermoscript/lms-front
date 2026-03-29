import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getSessionUser } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { IconArrowLeft, IconCertificate, IconCheck, IconClock } from '@tabler/icons-react'

export default async function AdminEnrollmentsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('dashboard.admin.enrollments')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/login')
  }

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, user_id, course_id')
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })

  // Get user profiles, courses, and emails in parallel
  const userIds = enrollments?.map((e) => e.user_id) || []
  const courseIds = enrollments?.map((e) => e.course_id) || []
  const adminClient = createAdminClient()

  const [{ data: profiles }, { data: courses }, ...emailResults] = await Promise.all([
    supabase.from('profiles').select('id, full_name')
      .in('id', userIds.length > 0 ? userIds : ['none']),
    supabase.from('courses').select('course_id, title')
      .eq('tenant_id', tenantId)
      .in('course_id', courseIds.length > 0 ? courseIds : [-1]),
    ...userIds.map(uid => adminClient.auth.admin.getUserById(uid)),
  ])

  const emailMap = new Map<string, string>()
  emailResults.forEach((result, i) => {
    if (result.data?.user?.email) emailMap.set(userIds[i], result.data.user.email)
  })

  const usersMap = new Map(profiles?.map((u) => [u.id, { ...u, email: emailMap.get(u.id) || '' }]))
  const coursesMap = new Map(courses?.map((c) => [c.course_id, c]))

  const activeCount = enrollments?.filter((e) => e.status === 'active').length || 0
  const completedCount = enrollments?.filter((e) => e.status === 'completed').length || 0

  return (
    <div className="min-h-screen bg-background" data-testid="enrollments-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
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

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{enrollments?.length || 0}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                  <IconCertificate className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <IconClock className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
                  <IconCheck className="h-[18px] w-[18px] text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.student')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.course')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.status')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.enrolled')}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('table.headers.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {enrollments && enrollments.length > 0 ? (
                    enrollments.map((enrollment) => {
                      const user = usersMap.get(enrollment.user_id)
                      const course = coursesMap.get(enrollment.course_id)

                      return (
                        <tr key={enrollment.enrollment_id} className="border-b last:border-0 transition-colors hover:bg-muted/40">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium">{user?.full_name || t('table.unknown')}</p>
                              <p className="text-[11px] text-muted-foreground/70">
                                {user?.email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium line-clamp-1">
                              {course?.title || t('table.unknownCourse')}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={
                                enrollment.status === 'active'
                                  ? 'default'
                                  : enrollment.status === 'completed'
                                    ? 'secondary'
                                    : 'outline'
                              }
                              className={`text-[10px] ${enrollment.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                            >
                              {enrollment.status === 'active' ? t('stats.active') : t('stats.completed')}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                            {format(new Date(enrollment.enrollment_date), 'MMM d, yyyy', { locale: dateLocale })}
                          </td>
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/student/courses/${enrollment.course_id}`}>
                              <Button variant="ghost" size="sm" className="text-xs">
                                {t('table.viewCourse')}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {t('table.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div >
  )
}
