import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { WelcomeHero } from '@/components/student/welcome-hero'
import { StatsCards } from '@/components/student/stats-cards'
import { CourseProgressCard } from '@/components/student/course-progress-card'
import { UpcomingExams } from '@/components/student/upcoming-exams'
import { RecentActivity } from '@/components/student/recent-activity'
import { IconRocket, IconSparkles } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

async function getData(userId: string) {
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
      .eq('status', 'active')
      .eq('course.lessons.lesson_completions.user_id', userId),

    supabase
      .from('exam_submissions')
      .select('*')
      .eq('student_id', userId)
      .order('submission_date', { ascending: false })
      .limit(5),

    supabase
      .from('lesson_completions')
      .select('*')
      .eq('user_id', userId),

    supabase
      .from('exams')
      .select(`
        *,
        course:courses(title)
      `)
      .gte('exam_date', new Date().toISOString())
      .order('exam_date', { ascending: true })
      .limit(5),

    supabase
      .from('subscriptions')
      .select('subscription_id, plan:plans!subscriptions_plan_id_fkey(plan_name)')
      .eq('user_id', userId)
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
      instructor: 'Instructor Name', // TODO: Add instructor data
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
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const data = await getData(user.id)
  const t = await getTranslations('dashboard.student')

  // Calculate stats
  const totalCoursesCompleted = data.courses.filter(c => c.progress === 100).length
  const totalLessonsCompleted = data.lessonCompletions.length
  const hoursStudied = (totalLessonsCompleted * 0.5).toFixed(1) // Estimate 30 min per lesson
  const certificatesEarned = totalCoursesCompleted

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 md:px-8 py-8 space-y-8">
        {/* Welcome Hero Section */}
        <WelcomeHero
          userName={user?.user_metadata?.full_name || user.email?.split('@')[0] || 'Student'}
          weeklyGoalProgress={80}
        />

        {/* Stats Cards */}
        <StatsCards
          hoursStudied={hoursStudied}
          coursesCompleted={totalCoursesCompleted}
          certificatesEarned={certificatesEarned}
        />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - In Progress Courses */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-foreground">In-Progress Courses</h2>
              <Link href="/dashboard/student/courses" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium">
                View All
              </Link>
            </div>

            {data.courses.length > 0 ? (
              <div className="flex flex-col gap-4">
                {data.courses
                  .filter(course => course.progress < 100)
                  .slice(0, 4)
                  .map((course) => (
                    <CourseProgressCard key={course.course_id} course={course} />
                  ))}
              </div>
            ) : data.hasActiveSubscription ? (
              <div className="bg-card border border-primary/20 rounded-2xl p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconSparkles className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">
                  Your {data.planName || 'subscription'} is active!
                </h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Browse available courses and enroll in the ones that interest you
                </p>
                <Link href="/dashboard/student/browse">
                  <Button className="bg-cyan-500 hover:bg-cyan-600 text-white">
                    Browse & Enroll in Courses
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-12 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <IconRocket className="h-8 w-8" />
                </div>
                <h3 className="text-xl font-bold text-foreground mb-2">No courses yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Start your learning journey by enrolling in a course
                </p>
                <Link href="/courses">
                  <Button className="bg-cyan-500 hover:bg-cyan-600 text-white">
                    Browse Courses
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Upcoming Exams */}
            <UpcomingExams exams={data.upcomingExams} />

            {/* Recent Activity */}
            <RecentActivity submissions={data.examSubmissions} />
          </div>
        </div>
      </main>
    </div>
  )
}

