import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CourseCard } from '@/components/student/course-card'
import { IconBook, IconSchool, IconTrophy } from '@tabler/icons-react'

export default async function StudentDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get enrolled courses with lesson counts and completion progress
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      enrollment_id,
      enrolled_at,
      course:courses (
        course_id,
        title,
        description,
        thumbnail_url
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'active')

  // Get lesson completions for progress calculation
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id, lessons!inner(course_id)')
    .eq('user_id', user.id)

  // Get total lessons per course
  const { data: lessonCounts } = await supabase
    .from('lessons')
    .select('course_id')
    .eq('status', 'published')

  // Calculate progress per course
  const progressMap = new Map<number, { completed: number; total: number }>()

  // Count total lessons per course
  lessonCounts?.forEach((lesson: any) => {
    const current = progressMap.get(lesson.course_id) || { completed: 0, total: 0 }
    progressMap.set(lesson.course_id, { ...current, total: current.total + 1 })
  })

  // Count completed lessons per course
  completions?.forEach((completion: any) => {
    const courseId = completion.lessons?.course_id
    if (courseId) {
      const current = progressMap.get(courseId) || { completed: 0, total: 0 }
      progressMap.set(courseId, { ...current, completed: current.completed + 1 })
    }
  })

  // Calculate stats
  const totalCourses = enrollments?.length || 0
  const totalCompletedLessons = completions?.length || 0
  const coursesCompleted = enrollments?.filter((e: any) => {
    const progress = progressMap.get(e.course?.course_id)
    return progress && progress.total > 0 && progress.completed >= progress.total
  }).length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">My Learning</h1>
          <p className="mt-1 text-muted-foreground">
            Welcome back! Continue where you left off.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <IconBook className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCourses}</p>
              <p className="text-sm text-muted-foreground">Enrolled Courses</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
              <IconSchool className="h-6 w-6 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalCompletedLessons}</p>
              <p className="text-sm text-muted-foreground">Lessons Completed</p>
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-500/10">
              <IconTrophy className="h-6 w-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{coursesCompleted}</p>
              <p className="text-sm text-muted-foreground">Courses Completed</p>
            </div>
          </div>
        </div>

        {/* Courses Grid */}
        {enrollments && enrollments.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {enrollments.map((enrollment: any) => {
              const course = enrollment.course
              if (!course) return null

              const progress = progressMap.get(course.course_id) || {
                completed: 0,
                total: 0,
              }

              return (
                <CourseCard
                  key={enrollment.enrollment_id}
                  course={course}
                  progress={{
                    completedLessons: progress.completed,
                    totalLessons: progress.total,
                  }}
                />
              )
            })}
          </div>
        ) : (
          <div className="rounded-lg border bg-card p-12 text-center">
            <IconBook className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">No courses yet</h3>
            <p className="mt-2 text-muted-foreground">
              You haven't enrolled in any courses. Browse our catalog to get started!
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
