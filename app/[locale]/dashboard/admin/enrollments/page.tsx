import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconCertificate,
  IconCheck,
  IconClock,
} from '@tabler/icons-react'

export default async function AdminEnrollmentsPage({
  params: { locale }
}: {
  params: { locale: string }
}) {
  const t = await getTranslations('dashboard.admin.enrollments')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, user_id, course_id')
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })

  // Get user profiles (profiles table is global - no tenant_id, no email column)
  const userIds = enrollments?.map((e) => e.user_id) || []
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds.length > 0 ? userIds : ['none'])

  // Get emails from auth.users via admin client
  const adminClient = createAdminClient()
  const emailMap = new Map<string, string>()
  for (const uid of userIds) {
    const { data } = await adminClient.auth.admin.getUserById(uid)
    if (data?.user?.email) {
      emailMap.set(uid, data.user.email)
    }
  }

  const usersMap = new Map(profiles?.map((u) => [u.id, { ...u, email: emailMap.get(u.id) || '' }]))

  // Get courses
  const courseIds = enrollments?.map((e) => e.course_id) || []
  const { data: courses } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('tenant_id', tenantId)
    .in('course_id', courseIds)

  const coursesMap = new Map(courses?.map((c) => [c.course_id, c]))

  const activeCount = enrollments?.filter((e) => e.status === 'active').length || 0
  const completedCount = enrollments?.filter((e) => e.status === 'completed').length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('backToDashboard')}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.total')}</p>
                  <p className="mt-2 text-3xl font-bold">{enrollments?.length || 0}</p>
                </div>
                <IconCertificate className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.active')}</p>
                  <p className="mt-2 text-3xl font-bold">{activeCount}</p>
                </div>
                <IconClock className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.completed')}</p>
                  <p className="mt-2 text-3xl font-bold">{completedCount}</p>
                </div>
                <IconCheck className="h-10 w-10 text-purple-500" />
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
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">{t('table.headers.student')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.course')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.status')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.enrolled')}</th>
                    <th className="pb-3 font-medium">{t('table.headers.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enrollments && enrollments.length > 0 ? (
                    enrollments.map((enrollment) => {
                      const user = usersMap.get(enrollment.user_id)
                      const course = coursesMap.get(enrollment.course_id)

                      return (
                        <tr key={enrollment.enrollment_id} className="text-sm">
                          <td className="py-4">
                            <div>
                              <p className="font-medium">{user?.full_name || t('table.unknown')}</p>
                              <p className="text-xs text-muted-foreground">
                                {user?.email}
                              </p>
                            </div>
                          </td>
                          <td className="py-4">
                            <p className="font-medium line-clamp-1">
                              {course?.title || t('table.unknownCourse')}
                            </p>
                          </td>
                          <td className="py-4">
                            <Badge
                              variant={
                                enrollment.status === 'active'
                                  ? 'default'
                                  : enrollment.status === 'completed'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {enrollment.status === 'active' ? t('stats.active') : t('stats.completed')}
                            </Badge>
                          </td>
                          <td className="py-4 text-muted-foreground">
                            {format(new Date(enrollment.enrollment_date), 'MMM d, yyyy', { locale: dateLocale })}
                          </td>
                          <td className="py-4">
                            <Link href={`/dashboard/student/courses/${enrollment.course_id}`}>
                              <Button variant="ghost" size="sm">
                                {t('table.viewCourse')}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
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
