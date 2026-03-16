import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconBook,
} from '@tabler/icons-react'
import { CoursesTable } from '@/components/admin/courses-table'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminCoursesPage() {
  const t = await getTranslations('dashboard.admin.courses')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Get all courses with author info
  const { data: courses } = await supabase
    .from('courses')
    .select('*, author_id')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  // Get author profiles, enrollment counts, and lesson counts in parallel
  const authorIds = courses?.map((c) => c.author_id) || []

  const [{ data: authors }, { data: enrollments }, { data: lessons }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email')
      .in('id', authorIds.length > 0 ? authorIds : ['none']),
    supabase.from('enrollments').select('course_id').eq('tenant_id', tenantId),
    supabase.from('lessons').select('course_id').eq('tenant_id', tenantId),
  ])

  const authorsMap = new Map(authors?.map((a) => [a.id, a]))

  const enrollmentCounts = new Map<number, number>()
  enrollments?.forEach((e) => {
    enrollmentCounts.set(e.course_id, (enrollmentCounts.get(e.course_id) || 0) + 1)
  })

  const lessonCounts = new Map<number, number>()
  lessons?.forEach((l) => {
    lessonCounts.set(l.course_id, (lessonCounts.get(l.course_id) || 0) + 1)
  })

  const publishedCount = courses?.filter((c) => c.status === 'published').length || 0
  const draftCount = courses?.filter((c) => c.status === 'draft').length || 0

  return (
    <div className="min-h-screen bg-background" data-testid="admin-courses-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('courses') },
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
                  <p className="mt-2 text-2xl font-bold tracking-tight">{courses?.length || 0}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                  <IconBook className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.published')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{publishedCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <IconBook className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.drafts')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{draftCount}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/40">
                  <IconBook className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Courses Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <CoursesTable
              courses={courses || []}
              authorsMap={authorsMap}
              lessonCounts={lessonCounts}
              enrollmentCounts={enrollmentCounts}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
