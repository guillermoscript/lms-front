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

export default async function AdminCoursesPage() {
  const t = await getTranslations('dashboard.admin.courses')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all courses with author info
  const { data: courses } = await supabase
    .from('courses')
    .select('*, author_id')
    .order('created_at', { ascending: false })

  // Get author profiles
  const authorIds = courses?.map((c) => c.author_id) || []
  const { data: authors } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', authorIds)

  const authorsMap = new Map(authors?.map((a) => [a.id, a]))

  // Get enrollment counts
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('course_id')

  const enrollmentCounts = new Map<number, number>()
  enrollments?.forEach((e) => {
    enrollmentCounts.set(e.course_id, (enrollmentCounts.get(e.course_id) || 0) + 1)
  })

  // Get lesson counts
  const { data: lessons } = await supabase
    .from('lessons')
    .select('course_id')

  const lessonCounts = new Map<number, number>()
  lessons?.forEach((l) => {
    lessonCounts.set(l.course_id, (lessonCounts.get(l.course_id) || 0) + 1)
  })

  const publishedCount = courses?.filter((c) => c.status === 'published').length || 0
  const draftCount = courses?.filter((c) => c.status === 'draft').length || 0

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
                  <p className="mt-2 text-3xl font-bold">{courses?.length || 0}</p>
                </div>
                <IconBook className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.published')}</p>
                  <p className="mt-2 text-3xl font-bold">{publishedCount}</p>
                </div>
                <IconBook className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.drafts')}</p>
                  <p className="mt-2 text-3xl font-bold">{draftCount}</p>
                </div>
                <IconBook className="h-10 w-10 text-yellow-500" />
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
