import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconBook,
  IconUsers,
  IconFileText,
  IconEdit,
  IconEye,
} from '@tabler/icons-react'

export default async function TeacherDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get courses created by this teacher
  const { data: courses } = await supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      status,
      created_at,
      published_at
    `)
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })

  // Get stats for each course
  const courseIds = courses?.map(c => c.course_id) || []

  // Get enrollment counts
  const { data: enrollmentCounts } = await supabase
    .from('enrollments')
    .select('course_id')
    .in('course_id', courseIds)
    .eq('status', 'active')

  // Get lesson counts
  const { data: lessonCounts } = await supabase
    .from('lessons')
    .select('course_id')
    .in('course_id', courseIds)

  // Get exam counts
  const { data: examCounts } = await supabase
    .from('exams')
    .select('course_id')
    .in('course_id', courseIds)

  // Get pending exam submissions
  const { data: pendingSubmissions } = await supabase
    .from('exam_submissions')
    .select('submission_id, exam_id, exams!inner(course_id)')
    .in('exams.course_id', courseIds)
    .is('exam_scores.score', null)

  // Map counts
  const enrollmentMap = new Map<number, number>()
  enrollmentCounts?.forEach((e: any) => {
    enrollmentMap.set(e.course_id, (enrollmentMap.get(e.course_id) || 0) + 1)
  })

  const lessonMap = new Map<number, number>()
  lessonCounts?.forEach((l: any) => {
    lessonMap.set(l.course_id, (lessonMap.get(l.course_id) || 0) + 1)
  })

  const examMap = new Map<number, number>()
  examCounts?.forEach((e: any) => {
    examMap.set(e.course_id, (examMap.get(e.course_id) || 0) + 1)
  })

  // Calculate totals
  const totalCourses = courses?.length || 0
  const totalStudents = enrollmentCounts?.length || 0
  const totalPendingReviews = pendingSubmissions?.length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">My Courses</h1>
              <p className="mt-1 text-muted-foreground">
                Create and manage your educational content
              </p>
            </div>
            <Link href="/dashboard/teacher/courses/new">
              <Button size="lg">
                <IconPlus className="mr-2 h-5 w-5" />
                Create Course
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Courses</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <IconBook className="h-6 w-6 text-primary" />
                {totalCourses}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Students</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <IconUsers className="h-6 w-6 text-green-500" />
                {totalStudents}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending Reviews</CardDescription>
              <CardTitle className="flex items-center gap-2 text-3xl">
                <IconFileText className="h-6 w-6 text-yellow-500" />
                {totalPendingReviews}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Courses Grid */}
        {courses && courses.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const enrollments = enrollmentMap.get(course.course_id) || 0
              const lessons = lessonMap.get(course.course_id) || 0
              const exams = examMap.get(course.course_id) || 0

              return (
                <Card key={course.course_id} className="flex flex-col">
                  {/* Thumbnail */}
                  <div className="aspect-video w-full overflow-hidden bg-muted">
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        alt={course.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <IconBook className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-lg">
                        {course.title}
                      </CardTitle>
                      <Badge
                        variant={
                          course.status === 'published'
                            ? 'default'
                            : course.status === 'draft'
                            ? 'secondary'
                            : 'outline'
                        }
                      >
                        {course.status}
                      </Badge>
                    </div>
                    {course.description && (
                      <CardDescription className="line-clamp-2">
                        {course.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="flex-1">
                    {/* Stats */}
                    <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
                      <div>
                        <p className="font-medium">{lessons}</p>
                        <p className="text-muted-foreground">Lessons</p>
                      </div>
                      <div>
                        <p className="font-medium">{exams}</p>
                        <p className="text-muted-foreground">Exams</p>
                      </div>
                      <div>
                        <p className="font-medium">{enrollments}</p>
                        <p className="text-muted-foreground">Students</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link
                        href={`/dashboard/teacher/courses/${course.course_id}`}
                        className="flex-1"
                      >
                        <Button variant="outline" size="sm" className="w-full">
                          <IconEdit className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      </Link>
                      <Link
                        href={`/dashboard/student/courses/${course.course_id}`}
                        className="flex-1"
                      >
                        <Button variant="ghost" size="sm" className="w-full">
                          <IconEye className="mr-2 h-4 w-4" />
                          Preview
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <IconBook className="mb-4 h-16 w-16 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-semibold">No courses yet</h3>
              <p className="mb-6 text-center text-muted-foreground">
                Create your first course to start teaching
              </p>
              <Link href="/dashboard/teacher/courses/new">
                <Button>
                  <IconPlus className="mr-2 h-5 w-5" />
                  Create Your First Course
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
