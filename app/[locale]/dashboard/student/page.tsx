import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { WelcomeHero } from '@/components/student/welcome-hero'
import { StatsCards } from '@/components/student/stats-cards'
import { CourseProgressCard } from '@/components/student/course-progress-card'
import { UpcomingExams } from '@/components/student/upcoming-exams'
import { RecentActivity } from '@/components/student/recent-activity'
import { IconRocket, IconSparkles, IconTrophy, IconCircleCheck } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { MiniLeaderboard } from '@/components/gamification/mini-leaderboard'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

async function getData(userId: string, tenantId: string) {
  const supabase = await createClient()

  const [enrollments, examSubmissions, lessonCompletions, upcomingExams, activeSubscription] = await Promise.all([
    supabase
      .from('enrollments')
      .select(`
        *,
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
      .select('*')
      .eq('student_id', userId)
      .eq('tenant_id', tenantId)
      .order('submission_date', { ascending: false })
      .limit(5),

    supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', tenantId),

    supabase
      .from('exams')
      .select(`
        *,
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
    upcomingExams: upcomingExams.data || [],
    hasActiveSubscription: (activeSubscription.data?.length ?? 0) > 0,
    planName: (activeSubscription.data?.[0]?.plan as any)?.plan_name || null,
  }
}

export default async function StudentDashboard() {
  const tenantId = await getCurrentTenantId()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const data = await getData(user.id, tenantId)
  const t = await getTranslations('dashboard.student')
  const tCommon = await getTranslations('common')

  const coursesInProgress = data.courses.filter(c => c.progress < 100)
  const coursesCompleted = data.courses.filter(c => c.progress === 100)
  const totalLessonsCompleted = data.lessonCompletions.length

  return (
    <div className="min-h-screen bg-background" data-testid="student-dashboard">
      <main className="container mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Welcome Hero */}
        <WelcomeHero
          userName={user?.user_metadata?.full_name || user.email?.split('@')[0] || 'Student'}
          coursesInProgress={coursesInProgress.length}
          lessonsCompleted={totalLessonsCompleted}
        />

        {/* Stats Cards */}
        <StatsCards
          totalLessonsCompleted={totalLessonsCompleted}
          coursesInProgress={coursesInProgress.length}
          coursesCompleted={coursesCompleted.length}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Courses */}
          <div className="lg:col-span-2 space-y-8">
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
                  Completed
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {coursesCompleted.slice(0, 4).map((course) => (
                    <Link key={course.course_id} href={`/dashboard/student/courses/${course.course_id}`}>
                      <div className="bg-card border border-border rounded-xl p-4 hover:border-emerald-500/30 transition-colors group">
                        <h3 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{course.title}</h3>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                          {course.totalLessons} lessons completed
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
                <div className="bg-card border border-primary/20 rounded-2xl p-10 text-center">
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
                <div className="bg-card border border-border rounded-2xl p-10 text-center">
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
          <div className="space-y-6">
            <MiniLeaderboard />
            <UpcomingExams exams={data.upcomingExams} />
            <RecentActivity submissions={data.examSubmissions} />
          </div>
        </div>
      </main>
    </div>
  )
}
