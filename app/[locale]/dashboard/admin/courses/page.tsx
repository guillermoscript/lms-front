import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconBook,
  IconPlus,
} from '@tabler/icons-react'
import { CoursesTable } from '@/components/admin/courses-table'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminCoursesPage() {
  const t = await getTranslations('dashboard.admin.courses')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Enrollment + lesson counts don't depend on the course list, so start them
  // immediately — they run concurrently with the courses query instead of behind it.
  // All reads are paged and count-verified: a plain select is silently capped at 1000 rows.
  const enrollmentsPromise = fetchAllRows('enrollments', (from, to) =>
    supabase
      .from('enrollments')
      .select('course_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('enrollment_id')
      .range(from, to),
  )
  const lessonsPromise = fetchAllRows('lessons', (from, to) =>
    supabase
      .from('lessons')
      .select('course_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('id')
      .range(from, to),
  )

  // Only select the columns the table actually renders (avoid serializing unused
  // course fields into the client component's props).
  const courses = await fetchAllRows('courses', (from, to) =>
    supabase
      .from('courses')
      .select('course_id, title, description, status, thumbnail_url, published_at, author_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('course_id')
      .range(from, to),
  )

  // Author profiles depend on the course list. Some courses (e.g. system/AI-generated) have no
  // author_id — filter nulls out, otherwise PostgREST's .in() rejects the query and every row
  // falls back to "Unknown".
  const authorIds = [...new Set(courses.map((c) => c.author_id).filter((id): id is string => Boolean(id)))]

  const [authors, enrollments, lessons] = await Promise.all([
    fetchAllRowsIn('profiles', authorIds, (chunk, from, to) =>
      supabase
        .from('profiles')
        .select('id, full_name, avatar_url', { count: 'exact' })
        .in('id', chunk)
        .order('id')
        .range(from, to),
    ),
    enrollmentsPromise,
    lessonsPromise,
  ])

  const authorsMap = new Map(authors.map((a) => [a.id, a]))

  const enrollmentCounts = new Map<number, number>()
  enrollments.forEach((e) => {
    enrollmentCounts.set(e.course_id, (enrollmentCounts.get(e.course_id) || 0) + 1)
  })

  const lessonCounts = new Map<number, number>()
  lessons.forEach((l) => {
    lessonCounts.set(l.course_id, (lessonCounts.get(l.course_id) || 0) + 1)
  })

  const publishedCount = courses.filter((c) => c.status === 'published').length
  const draftCount = courses.filter((c) => c.status === 'draft').length

  return (
    <div className="min-h-screen bg-background" data-testid="admin-courses-page">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto container px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('courses') },
              ]}
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
            </div>
            {/* Admins create courses through the teacher editor. Without this
                entry point the page reads as a read-only report and admins
                cannot find how to add a course (Sentry LMS-FRONT-9N). */}
            <Button size="sm" className="gap-2" nativeButton={false} render={<Link href="/dashboard/admin/courses/new" />} data-testid="admin-create-course">
              <IconPlus className="h-3.5 w-3.5" />
              {t('createCourse')}
            </Button>
          </div>
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
                  <p className="mt-2 text-2xl font-bold tracking-tight">{courses.length}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand-text">
                  <IconBook className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                  <IconBook className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <IconBook className="h-[18px] w-[18px]" strokeWidth={1.75} />
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
              courses={courses}
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
