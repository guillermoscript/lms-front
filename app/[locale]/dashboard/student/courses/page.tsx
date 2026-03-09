import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { EnrolledCourseCard } from '@/components/student/enrolled-course-card'
import { CourseFilters } from '@/components/student/course-filters'
import { Button } from '@/components/ui/button'
import { IconBook2, IconSparkles, IconCertificate, IconArrowRight } from '@tabler/icons-react'
import Link from 'next/link'
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch enrollments
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .order('enrollment_date', { ascending: false })

  // Enrich enrollments with related data
  let enrichedEnrollments: any[] = []

  if (enrollments && enrollments.length > 0) {
    for (const enrollment of enrollments) {
      const { data: course } = await supabase
        .from('courses')
        .select('course_id, title, description, thumbnail_url, status')
        .eq('course_id', enrollment.course_id)
        .eq('tenant_id', tenantId)
        .single()

      if (course) {
        const { data: lessons } = await supabase
          .from('lessons')
          .select('id, title, sequence')
          .eq('course_id', course.course_id)
          .eq('tenant_id', tenantId)

        const { data: lessonCompletions } = await supabase
          .from('lesson_completions')
          .select('lesson_id, completed_at')
          .eq('user_id', user.id)
          .eq('tenant_id', tenantId)
          .in('lesson_id', lessons?.map(l => l.id) || [])

        const { data: exams } = await supabase
          .from('exams')
          .select('exam_id, title, sequence, passing_score, allow_retake')
          .eq('course_id', course.course_id)
          .eq('tenant_id', tenantId)

        const { data: examSubmissions } = await supabase
          .from('exam_submissions')
          .select('submission_id, exam_id, submission_date, score')
          .eq('student_id', user.id)
          .eq('tenant_id', tenantId)
          .in('exam_id', exams?.map(e => e.exam_id) || [])

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

        let subscription = null
        if (enrollment.subscription_id) {
          const { data: s } = await supabase
            .from('subscriptions')
            .select('subscription_id, subscription_status, end_date, plan_id')
            .eq('subscription_id', enrollment.subscription_id)
            .eq('tenant_id', tenantId)
            .single()

          if (s) {
            const { data: plan } = await supabase
              .from('plans')
              .select('plan_id, plan_name')
              .eq('plan_id', s.plan_id)
              .eq('tenant_id', tenantId)
              .single()
            subscription = { ...s, plan }
          }
        }

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

  const t = await getTranslations('dashboard.student.courses')

  if (error) {
    return (
      <div className="mx-auto max-w-5xl py-12 px-4">
        <div className="text-center py-16">
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

  // Count by status for filter pills
  const counts = {
    all: processedEnrollments.length,
    in_progress: processedEnrollments.filter(e => e.course.progress > 0 && e.course.progress < 100).length,
    completed: processedEnrollments.filter(e => e.course.progress === 100).length,
    not_started: processedEnrollments.filter(e => e.course.progress === 0).length,
  }

  let filteredEnrollments = processedEnrollments.filter(enrollment => {
    if (params.status && params.status !== 'all') {
      if (params.status === 'completed' && enrollment.course.progress < 100) return false
      if (params.status === 'in_progress' && (enrollment.course.progress === 0 || enrollment.course.progress === 100)) return false
      if (params.status === 'not_started' && enrollment.course.progress > 0) return false
    }

    if (params.search) {
      const search = params.search.toLowerCase()
      return (
        enrollment.course.title.toLowerCase().includes(search) ||
        enrollment.course.description?.toLowerCase().includes(search)
      )
    }

    return true
  })

  if (params.sort === 'title') {
    filteredEnrollments.sort((a, b) => a.course.title.localeCompare(b.course.title))
  } else if (params.sort === 'progress') {
    filteredEnrollments.sort((a, b) => b.course.progress - a.course.progress)
  }

  // Fetch certificate count for the banner
  const { count: certificateCount } = await supabase
    .from('certificates')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .is('revoked_at', null)

  const hasEnrollments = enrichedEnrollments.length > 0
  const hasFilteredEnrollments = filteredEnrollments.length > 0

  return (
    <div className="mx-auto container py-5 sm:py-8 px-4 lg:px-8 space-y-5 sm:space-y-6" data-testid="student-courses-page">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight" data-testid="my-courses-title">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hasEnrollments
              ? t('enrolledMessage', { count: enrichedEnrollments.length, s: enrichedEnrollments.length === 1 ? '' : 's' })
              : t('startJourney')
            }
          </p>
        </div>

        <div className="flex gap-2">
          <Link href="/dashboard/student/browse">
            <Button variant="outline" size="sm" className="gap-1.5 h-9 text-xs font-bold">
              <IconSparkles size={14} />
              {t('browseCatalog')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Certificates Banner */}
      {(certificateCount ?? 0) > 0 && (
        <Link href="/dashboard/student/certificates" className="block group">
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] via-amber-500/[0.03] to-transparent p-4 sm:px-6 hover:border-amber-500/30 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                  <IconCertificate size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold">
                    {certificateCount} {certificateCount === 1 ? 'Certificate' : 'Certificates'} Earned
                  </p>
                  <p className="text-xs text-muted-foreground">View, download and share your achievements</p>
                </div>
              </div>
              <IconArrowRight size={16} className="text-muted-foreground group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
            </div>
          </div>
        </Link>
      )}

      {!hasEnrollments ? (
        /* Empty State */
        <div className="rounded-2xl border-2 border-dashed border-muted-foreground/15 p-8 sm:p-16 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
            <IconBook2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-2">{t('noCoursesTitle')}</h2>
          <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto leading-relaxed">
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
            counts={counts}
          />

          {/* Course List */}
          {!hasFilteredEnrollments ? (
            <div className="rounded-2xl border border-dashed p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {t('noFilterMatch')}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
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
