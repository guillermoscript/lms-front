import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTranslations } from 'next-intl/server'
import { WelcomeHero } from '@/components/student/welcome-hero'
import { StatsCards } from '@/components/student/stats-cards'
import { CourseProgressCard } from '@/components/student/course-progress-card'
import { UpcomingExams } from '@/components/student/upcoming-exams'
import { RecentActivity } from '@/components/student/recent-activity'
import { IconRocket, IconSparkles, IconCircleCheck } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MiniLeaderboard } from '@/components/gamification/mini-leaderboard'
import { getCurrentTenantId, getSessionUser } from '@/lib/supabase/tenant'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { StudentDashboardTour } from '@/components/tours/student-dashboard-tour'

async function getData(userId: string, tenantId: string) {
  const supabase = createAdminClient()

  const [enrollments, examSubmissions, lessonCompletions, upcomingExams, activeSubscription] = await Promise.all([
    supabase
      .from('enrollments')
      .select(`
        enrollment_id,
        course:courses (
          course_id,
          title,
          description,
          thumbnail_url,
          lessons (id, title, lesson_completions(id, user_id)),
          exams (exam_id, title, exam_date)
        )
      `)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .eq('course.lessons.lesson_completions.user_id', userId),

    supabase
      .from('exam_submissions')
      .select('submission_id, exam_id, score, submission_date')
      .eq('student_id', userId)
      .eq('tenant_id', tenantId)
      .order('submission_date', { ascending: false })
      .limit(5),

    supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId),

    supabase
      .from('exams')
      .select(`
        exam_id, title, exam_date,
        course:courses(title)
      `)
      .eq('tenant_id', tenantId)
      .gte('exam_date', new Date().toISOString())
      .order('exam_date', { ascending: true })
      .limit(5),

    supabase
      .from('subscriptions')
      .select('subscription_id, plan:plans!subscriptions_plan_id_fkey(plan_name)')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .eq('subscription_status', 'active')
      .gte('end_date', new Date().toISOString())
      .order('end_date', { ascending: false })
      .limit(1),
  ])

  if (enrollments.error) throw new Error(enrollments.error.message)

  const courses = (enrollments.data as any[])?.map((enrollment) => {
    const course = enrollment.course
    const lessons = course?.lessons || []
    const completedLessons = lessons.filter((l: any) =>
      l.lesson_completions?.some((lc: any) => lc.user_id === userId)
    ).length

    return {
      course_id: course?.course_id,
      title: course?.title,
      description: course?.description,
      thumbnail_url: course?.thumbnail_url,
      completedLessons,
      totalLessons: lessons.length,
      progress: lessons.length > 0 ? Math.round((completedLessons / lessons.length) * 100) : 0,
    }
  }) || []

  return {
    courses,
    examSubmissions: examSubmissions.data || [],
    lessonCompletions: lessonCompletions.data || [],
    upcomingExams: (upcomingExams.data || []) as any[],
    hasActiveSubscription: (activeSubscription.data?.length ?? 0) > 0,
    planName: (activeSubscription.data?.[0]?.plan as any)?.plan_name || null,
  }
}

export default async function StudentDashboard() {
  const tenantId = await getCurrentTenantId()
  const supabase = createAdminClient()
  const user = await getSessionUser()
  if (!user) {
    redirect('/auth/login')
  }

  const data = await getData(user.id, tenantId)
  const t = await getTranslations('dashboard.student')
  const tCommon = await getTranslations('common')

  const coursesInProgress = data.courses.filter(c => c.progress < 100)
  const coursesCompleted = data.courses.filter(c => c.progress === 100)
  const totalLessonsCompleted = data.lessonCompletions.length

  // Find the best "continue" course — the one with most progress that isn't done
  const nextCourse = coursesInProgress
    .sort((a, b) => b.progress - a.progress)[0] || null

  return (
    <div className="min-h-screen bg-background" data-testid="student-dashboard">
      {/* Guided Tour */}
      <StudentDashboardTour userId={user.id} />

      <main className="container mx-auto px-4 md:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Welcome + Continue CTA */}
        <div data-tour="student-welcome">
        <WelcomeHero
          userName={user?.user_metadata?.full_name || user.email?.split('@')[0] || 'Student'}
          coursesInProgress={coursesInProgress.length}
          lessonsCompleted={totalLessonsCompleted}
          nextCourse={nextCourse}
        />
        </div>

        {/* Inline stats — compact, not card-based */}
        {data.courses.length > 0 && (
          <div data-tour="student-stats">
          <StatsCards
            totalLessonsCompleted={totalLessonsCompleted}
            coursesInProgress={coursesInProgress.length}
            coursesCompleted={coursesCompleted.length}
          />
          </div>
        )}

        {/* Getting Started Checklist */}
        <div data-tour="student-checklist">
        <OnboardingChecklist
          storageKey={`student-${user.id}`}
          title={t('onboarding.title')}
          subtitle={t('onboarding.subtitle')}
          steps={[
            {
              id: 'browse-courses',
              label: t('onboarding.browseCourses'),
              description: t('onboarding.browseCoursesDesc'),
              href: '/dashboard/student/browse',
              completed: data.courses.length > 0,
            },
            {
              id: 'complete-lesson',
              label: t('onboarding.completeLesson'),
              description: t('onboarding.completeLessonDesc'),
              href: data.courses[0] ? `/dashboard/student/courses/${data.courses[0].course_id}` : '/dashboard/student/browse',
              completed: totalLessonsCompleted > 0,
            },
            {
              id: 'finish-course',
              label: t('onboarding.finishCourse'),
              description: t('onboarding.finishCourseDesc'),
              href: data.courses[0] ? `/dashboard/student/courses/${data.courses[0].course_id}` : '/dashboard/student/browse',
              completed: coursesCompleted.length > 0,
            },
          ]}
        />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          {/* Left Column - Courses */}
          <div className="lg:col-span-2 space-y-6 sm:space-y-8" data-tour="student-courses">
            {/* In Progress Courses */}
            {coursesInProgress.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">{t('inProgressCourses')}</h2>
                  <Link href="/dashboard/student/courses" className="text-sm text-primary hover:underline font-medium">
                    {tCommon('viewAll')}
                  </Link>
                </div>
                <div className="flex flex-col gap-4">
                  {coursesInProgress.slice(0, 4).map((course) => (
                    <CourseProgressCard key={course.course_id} course={course} />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Courses */}
            {coursesCompleted.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <IconCircleCheck size={20} className="text-emerald-500" />
                  {tCommon('completed')}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coursesCompleted.slice(0, 4).map((course) => (
                    <Link key={course.course_id} href={`/dashboard/student/courses/${course.course_id}`}>
                      <div className="bg-card border border-border rounded-xl p-3.5 sm:p-4 hover:border-emerald-500/30 active:border-emerald-500/30 transition-colors group">
                        <h3 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{course.title}</h3>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                          {course.totalLessons} {tCommon('lessonsCompleted')}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State — no courses at all */}
            {data.courses.length === 0 && (
              data.hasActiveSubscription ? (
                <div className="bg-card border border-primary/20 rounded-2xl p-6 sm:p-10 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <IconSparkles className="h-7 w-7" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">
                    {t('activeSubscriptionTitle', { planName: data.planName || 'subscription' })}
                  </h2>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                    {t('activeSubscriptionDesc')}
                  </p>
                  <Link href="/dashboard/student/browse">
                    <Button>{t('browseAndEnroll')}</Button>
                  </Link>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <IconRocket className="h-7 w-7" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">{t('noCoursesYet')}</h2>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                    {t('startJourneyDesc')}
                  </p>
                  <Link href="/pricing">
                    <Button>{tCommon('browseCourses')}</Button>
                  </Link>
                </div>
              )
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6" data-tour="student-sidebar">
            <MiniLeaderboard />
            <UpcomingExams exams={data.upcomingExams} />
            <RecentActivity submissions={data.examSubmissions} />
          </div>
        </div>
      </main>
    </div>
  )
}
