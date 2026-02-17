import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { EnrolledCourseCard } from '@/components/student/enrolled-course-card'
import { CourseFilters } from '@/components/student/course-filters'
import { Button } from '@/components/ui/button'
import { IconBook, IconSparkles, IconTrophy } from '@tabler/icons-react'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  searchParams: Promise<{
    status?: 'all' | 'in_progress' | 'completed' | 'not_started'
    sort?: 'recent' | 'title' | 'progress'
    search?: string
  }>
}

export default async function MyCoursesPage({ searchParams }: PageProps) {
  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()
  const params = await searchParams

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch enrollments - basic query first to debug
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })

  // If we have enrollments, fetch related data separately
  let enrichedEnrollments: any[] = []

  if (enrollments && enrollments.length > 0) {
    // Fetch course data for each enrollment
    for (const enrollment of enrollments) {
      const { data: course } = await supabase
        .from('courses')
        .select('course_id, title, description, thumbnail_url, status')
        .eq('course_id', enrollment.course_id)
        .eq('tenant_id', tenantId)
        .single()

      if (course) {
        // Fetch lessons
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id, title, sequence')
          .eq('course_id', course.course_id)
          .eq('tenant_id', tenantId)

        // Fetch lesson completions for this user
        const { data: lessonCompletions } = await supabase
          .from('lesson_completions')
          .select('lesson_id, completed_at')
          .eq('user_id', user.id)
          .eq('tenant_id', tenantId)
          .in('lesson_id', lessons?.map(l => l.id) || [])

        // Fetch exams
        const { data: exams } = await supabase
          .from('exams')
          .select('exam_id, title, sequence, passing_score, allow_retake')
          .eq('course_id', course.course_id)
          .eq('tenant_id', tenantId)

        // Fetch exam submissions
        const { data: examSubmissions } = await supabase
          .from('exam_submissions')
          .select('submission_id, exam_id, submission_date, score')
          .eq('student_id', user.id)
          .eq('tenant_id', tenantId)
          .in('exam_id', exams?.map(e => e.exam_id) || [])

        // Fetch product if exists
        let product = null
        if (enrollment.product_id) {
          const { data: p } = await supabase
            .from('products')
            .select('product_id, name')
            .eq('product_id', enrollment.product_id)
            .eq('tenant_id', tenantId)
            .single()
          product = p
        }

        // Fetch subscription if exists
        let subscription = null
        if (enrollment.subscription_id) {
          const { data: s } = await supabase
            .from('subscriptions')
            .select('subscription_id, subscription_status, end_date, plan_id')
            .eq('subscription_id', enrollment.subscription_id)
            .eq('tenant_id', tenantId)
            .single()

          if (s) {
            // Fetch plan
            const { data: plan } = await supabase
              .from('plans')
              .select('plan_id, plan_name')
              .eq('plan_id', s.plan_id)
              .eq('tenant_id', tenantId)
              .single()
            subscription = { ...s, plan }
          }
        }

        // Combine all data
        enrichedEnrollments.push({
          ...enrollment,
          course: {
            ...course,
            lessons: lessons?.map(lesson => ({
              ...lesson,
              lesson_completions: lessonCompletions?.filter(lc => lc.lesson_id === lesson.id) || []
            })) || [],
            exams: exams?.map(exam => ({
              ...exam,
              exam_submissions: examSubmissions?.filter(es => es.exam_id === exam.exam_id) || []
            })) || []
          },
          product,
          subscription
        })
      }
    }
  }

  // Fetch translations
  const t = await getTranslations('dashboard.student.courses')
  const tCommon = await getTranslations('common')
  const tBrowse = await getTranslations('dashboard.student.browse')

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('errorLoading')}</p>
        </div>
      </div>
    )
  }

  // Calculate progress and apply filters
  const processedEnrollments = enrichedEnrollments.map(enrollment => {
    const totalItems = enrollment.course.lessons.length
    const completedItems = enrollment.course.lessons.filter((l: any) => l.lesson_completions.length > 0).length
    const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0

    return {
      ...enrollment,
      course: {
        ...enrollment.course,
        progress
      }
    }
  })

  let filteredEnrollments = processedEnrollments.filter(enrollment => {
    // Status filter
    if (params.status && params.status !== 'all') {
      if (params.status === 'completed' && enrollment.course.progress < 100) return false
      if (params.status === 'in_progress' && (enrollment.course.progress === 0 || enrollment.course.progress === 100)) return false
      if (params.status === 'not_started' && enrollment.course.progress > 0) return false
    }

    // Search filter
    if (params.search) {
      const search = params.search.toLowerCase()
      return (
        enrollment.course.title.toLowerCase().includes(search) ||
        enrollment.course.description?.toLowerCase().includes(search)
      )
    }

    return true
  })

  // Sort logic
  if (params.sort === 'title') {
    filteredEnrollments.sort((a, b) => a.course.title.localeCompare(b.course.title))
  } else if (params.sort === 'progress') {
    filteredEnrollments.sort((a, b) => b.course.progress - a.course.progress)
  }

  const hasEnrollments = enrichedEnrollments.length > 0
  const hasFilteredEnrollments = filteredEnrollments.length > 0

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">{t('title')}</h1>
          <p className="text-muted-foreground">
            {hasEnrollments
              ? t('enrolledMessage', { count: enrichedEnrollments.length, s: enrichedEnrollments.length === 1 ? '' : 's' }) // 's' handling might vary by locale, simplified for now
              : t('startJourney')
            }
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/dashboard/student/browse">
            <Button variant="outline" className="gap-2">
              <IconSparkles className="w-4 h-4" />
              {t('browseCatalog')}
            </Button>
          </Link>
          <Link href="/pricing">
            <Button className="gap-2">
              <IconTrophy className="w-4 h-4" />
              {t('upgradePlan')}
            </Button>
          </Link>
        </div>
      </div>

      {!hasEnrollments ? (
        /* Empty State */
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <IconBook className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">{t('noCoursesTitle')}</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            {t('noCoursesDesc')}
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/courses">
              <Button>{t('browseCatalog')}</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="outline">{t('viewPlans')}</Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Filters */}
          <CourseFilters
            currentStatus={params.status || 'all'}
            currentSort={params.sort || 'recent'}
            currentSearch={params.search || ''}
          />

          {/* Course Grid */}
          {!hasFilteredEnrollments ? (
            <div className="border rounded-lg p-8 text-center">
              <p className="text-muted-foreground">
                {t('noFilterMatch')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {filteredEnrollments.map((enrollment) => (
                <EnrolledCourseCard
                  key={enrollment.enrollment_id}
                  enrollment={enrollment}
                  userId={user.id}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
