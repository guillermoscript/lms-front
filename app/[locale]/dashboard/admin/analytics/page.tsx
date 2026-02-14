import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RevenueChart } from '@/components/admin/revenue-chart'
import { UserGrowthChart } from '@/components/admin/user-growth-chart'
import { EngagementMetrics } from '@/components/admin/engagement-metrics'
import { CoursePopularityChart } from '@/components/admin/course-popularity-chart'
import { ExportButton } from '@/components/admin/export-button'
import { IconChartBar, IconDownload } from '@tabler/icons-react'
import Link from 'next/link'

interface SearchParams {
  period?: string
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const role = await getUserRole()
  if (role !== 'admin') {
    redirect('/dashboard/student')
  }

  // Get period from query params (default: 30 days)
  const period = searchParams.period || '30'
  const daysAgo = parseInt(period)
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysAgo)

  // Calculate revenue data by day
  const { data: transactions } = await supabase
    .from('transactions')
    .select('amount, status, created_at')
    .eq('status', 'successful')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  // Group revenue by date
  const revenueByDate = new Map<string, { revenue: number; transactions: number }>()
  let totalRevenue = 0

  transactions?.forEach((t) => {
    const date = new Date(t.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    const existing = revenueByDate.get(date) || { revenue: 0, transactions: 0 }
    revenueByDate.set(date, {
      revenue: existing.revenue + (t.amount || 0),
      transactions: existing.transactions + 1,
    })
    totalRevenue += t.amount || 0
  })

  const revenueData = Array.from(revenueByDate.entries()).map(([date, data]) => ({
    date,
    revenue: data.revenue,
    transactions: data.transactions,
  }))

  // Calculate user growth data
  const { data: profiles } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })

  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // Group users by date
  const usersByDate = new Map<string, number>()
  let runningTotal = (totalUsers || 0) - (profiles?.length || 0)

  profiles?.forEach((p) => {
    const date = new Date(p.created_at).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
    const existing = usersByDate.get(date) || 0
    usersByDate.set(date, existing + 1)
  })

  const userGrowthData = Array.from(usersByDate.entries()).map(([date, newUsers]) => {
    runningTotal += newUsers
    return {
      date,
      newUsers,
      totalUsers: runningTotal,
    }
  })

  // Get engagement metrics
  const { count: totalEnrollments } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })

  // Active students (users with activity in last 30 days)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: activeStudentIds } = await supabase
    .from('lesson_completions')
    .select('student_id')
    .gte('completed_at', thirtyDaysAgo.toISOString())

  const activeStudents = new Set(activeStudentIds?.map((s) => s.student_id)).size

  const { count: totalLessonCompletions } = await supabase
    .from('lesson_completions')
    .select('*', { count: 'exact', head: true })

  const { count: totalExamSubmissions } = await supabase
    .from('exam_submissions')
    .select('*', { count: 'exact', head: true })

  // Calculate average completion rate
  const { data: enrollmentsWithProgress } = await supabase
    .from('enrollments')
    .select(
      `
      enrollment_id,
      course:courses (
        course_id,
        lessons:lessons (count)
      )
    `
    )

  let totalCompletionRate = 0
  let validEnrollments = 0

  if (enrollmentsWithProgress) {
    for (const enrollment of enrollmentsWithProgress) {
      const course = enrollment.course as any
      if (!course?.lessons?.[0]?.count) continue

      const totalLessons = course.lessons[0].count
      if (totalLessons === 0) continue

      const { count: completedLessons } = await supabase
        .from('lesson_completions')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', (enrollment as any).student_id)
        .in(
          'lesson_id',
          (
            await supabase
              .from('lessons')
              .select('lesson_id')
              .eq('course_id', course.course_id)
          ).data?.map((l) => l.lesson_id) || []
        )

      const completionRate = (completedLessons || 0) / totalLessons
      totalCompletionRate += completionRate
      validEnrollments++
    }
  }

  const averageCompletionRate =
    validEnrollments > 0 ? (totalCompletionRate / validEnrollments) * 100 : 0

  // Get course popularity data
  const { data: coursesWithEnrollments } = await supabase
    .from('courses')
    .select(
      `
      course_id,
      title,
      enrollments:enrollments (count),
      lessons:lessons (
        lesson_id
      )
    `
    )
    .eq('status', 'published')

  const coursePopularityData = await Promise.all(
    (coursesWithEnrollments || []).map(async (course) => {
      const enrollmentCount = (course.enrollments as any[])?.[0]?.count || 0
      const lessonIds = (course.lessons as any[])?.map((l) => l.lesson_id) || []

      if (lessonIds.length === 0) {
        return {
          courseId: course.course_id,
          title: course.title,
          enrollments: enrollmentCount,
          completionRate: 0,
        }
      }

      // Get enrollments for this course
      const { data: courseEnrollments } = await supabase
        .from('enrollments')
        .select('user_id')
        .eq('course_id', course.course_id)

      if (!courseEnrollments || courseEnrollments.length === 0) {
        return {
          courseId: course.course_id,
          title: course.title,
          enrollments: 0,
          completionRate: 0,
        }
      }

      // Calculate completion rate for this course
      let totalCompletions = 0
      for (const enrollment of courseEnrollments) {
        const { count: completedCount } = await supabase
          .from('lesson_completions')
          .select('*', { count: 'exact', head: true })
          .eq('student_id', enrollment.user_id)
          .in('lesson_id', lessonIds)

        totalCompletions += (completedCount || 0) / lessonIds.length
      }

      const completionRate =
        courseEnrollments.length > 0
          ? (totalCompletions / courseEnrollments.length) * 100
          : 0

      return {
        courseId: course.course_id,
        title: course.title,
        enrollments: enrollmentCount,
        completionRate,
      }
    })
  )

  coursePopularityData.sort((a, b) => b.enrollments - a.enrollments)

  const periodLabels: Record<string, string> = {
    '7': 'last 7 days',
    '30': 'last 30 days',
    '90': 'last 90 days',
    '365': 'last year',
  }

  const periodLabel = periodLabels[period] || `last ${period} days`

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <IconChartBar className="h-8 w-8" />
            Analytics & Reports
          </h1>
          <p className="mt-1 text-muted-foreground">
            Platform performance and engagement insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Export button */}
          <ExportButton
            data={{
              revenueData,
              userGrowthData,
              coursePopularityData,
              metrics: {
                totalRevenue,
                totalUsers: totalUsers || 0,
                totalEnrollments: totalEnrollments || 0,
                activeStudents,
                averageCompletionRate,
              },
            }}
            period={period}
          />
          {/* Period selector */}
          <div className="flex gap-2">
            <Link href="?period=7">
              <Button variant={period === '7' ? 'default' : 'outline'} size="sm">
                7 Days
              </Button>
            </Link>
            <Link href="?period=30">
              <Button variant={period === '30' ? 'default' : 'outline'} size="sm">
                30 Days
              </Button>
            </Link>
            <Link href="?period=90">
              <Button variant={period === '90' ? 'default' : 'outline'} size="sm">
                90 Days
              </Button>
            </Link>
            <Link href="?period=365">
              <Button variant={period === '365' ? 'default' : 'outline'} size="sm">
                1 Year
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* Revenue Chart */}
        <RevenueChart
          data={revenueData}
          totalRevenue={totalRevenue}
          period={periodLabel}
        />

        {/* User Growth Chart */}
        <UserGrowthChart
          data={userGrowthData}
          totalUsers={totalUsers || 0}
          period={periodLabel}
        />

        {/* Engagement Metrics */}
        <EngagementMetrics
          totalEnrollments={totalEnrollments || 0}
          activeStudents={activeStudents}
          averageCompletionRate={averageCompletionRate}
          totalLessonCompletions={totalLessonCompletions || 0}
          totalExamSubmissions={totalExamSubmissions || 0}
        />

        {/* Course Popularity */}
        <CoursePopularityChart data={coursePopularityData} />
      </div>
    </main>
  )
}
