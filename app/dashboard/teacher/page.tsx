import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconPlus,
  IconBook,
  IconTemplate,
  IconUsers,
  IconFileText,
  IconEdit,
  IconEye,
  IconChartBar,
  IconCalendar,
  IconArrowRight,
  IconCurrencyDollar,
  IconBolt
} from '@tabler/icons-react'
import * as motion from 'motion/react-client'

export default async function TeacherDashboard() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // 1. Get courses first (to avoid complex join errors)
  const { data: coursesData, error: coursesError } = await supabase
    .from('courses')
    .select(`
            *,
            lessons(id),
            exams(exam_id)
        `)
    .eq('author_id', user.id)
    .order('created_at', { ascending: false })

  if (coursesError) {
    console.error('Error fetching courses:', coursesError)
  }

  const courses = coursesData || []
  const courseIds = courses.map(c => c.course_id)

  // 2. Fetch other related data in parallel using courseIds
  const [enrollmentsRes, allEnrollmentsRes, submissionsRes, profileRes] = await Promise.all([
    // Recent activity enrollments
    courseIds.length > 0
      ? supabase
        .from('enrollments')
        .select(`
                    enrollment_date,
                    profiles(id, full_name, avatar_url),
                    courses!inner(title)
                `)
        .in('course_id', courseIds)
        .order('enrollment_date', { ascending: false })
        .limit(5)
      : Promise.resolve({ data: [] }),

    // Total enrollment count across all courses
    courseIds.length > 0
      ? supabase
        .from('enrollments')
        .select('enrollment_id')
        .in('course_id', courseIds)
      : Promise.resolve({ data: [] }),

    // Submissions for these courses
    courseIds.length > 0
      ? supabase
        .from('exam_submissions')
        .select('submission_id, exam_id, exams!inner(course_id)')
        .in('exams.course_id', courseIds)
      : Promise.resolve({ data: [] }),

    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()
  ])

  const recentEnrollments = enrollmentsRes.data || []
  const totalEnrollmentsList = allEnrollmentsRes.data || []
  const allSubmissions = submissionsRes.data || []
  const profile = profileRes.data

  // Calculate totals
  const totalCourses = courses.length
  const totalStudents = totalEnrollmentsList.length
  const totalLessons = courses.reduce((acc, c) => acc + (c.lessons?.length || 0), 0)
  const totalPendingReviews = allSubmissions.length

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Welcome back, {profile?.full_name?.split(' ')[0] || 'Teacher'}!
          </h2>
          <p className="text-muted-foreground">
            Here's what's happening with your courses and students today.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/dashboard/teacher/templates">
            <Button variant="outline" className="transition-all active:scale-95">
              <IconTemplate className="mr-2 h-4 w-4" />
              Prompt Templates
            </Button>
          </Link>
          <Link href="/dashboard/teacher/courses/new">
            <Button className="shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 transition-all active:scale-95">
              <IconPlus className="mr-2 h-4 w-4" />
              Create New Course
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-none bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-background shadow-md backdrop-blur-sm ring-1 ring-blue-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Courses</CardTitle>
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <IconBook className="h-4 w-4 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCourses}</div>
              <p className="text-xs text-muted-foreground">
                {totalLessons} total lessons
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-none bg-gradient-to-br from-green-500/10 via-green-500/5 to-background shadow-md backdrop-blur-sm ring-1 ring-green-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Students</CardTitle>
              <div className="p-2 bg-green-500/10 rounded-lg">
                <IconUsers className="h-4 w-4 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalStudents}</div>
              <p className="text-xs text-muted-foreground">
                Across all published courses
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-none bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-background shadow-md backdrop-blur-sm ring-1 ring-amber-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Submissions</CardTitle>
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <IconFileText className="h-4 w-4 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPendingReviews}</div>
              <p className="text-xs text-muted-foreground">
                Total exams submitted
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-none bg-gradient-to-br from-indigo-500/10 via-indigo-500/5 to-background shadow-md backdrop-blur-sm ring-1 ring-indigo-500/10">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <IconBolt className="h-4 w-4 text-indigo-600" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="h-2 w-full bg-indigo-500/10 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 w-[65%] rounded-full" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Platform activity: Active
              </p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Courses Section */}
        <Card className="lg:col-span-4 border-none shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-border">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Your Courses</CardTitle>
              <CardDescription>
                Manage and monitor your educational content.
              </CardDescription>
            </div>
            <Link href="/dashboard/teacher/courses">
              <Button variant="ghost" size="sm" className="text-primary">
                View all
                <IconArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {courses.length > 0 ? (
                courses.map((course, idx) => (
                  <motion.div
                    key={course.course_id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * idx }}
                    className="group relative flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-accent/50 hover:border-primary/50 transition-all duration-300 shadow-sm"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden border">
                        {course.thumbnail_url ? (
                          <img src={course.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <IconBook className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold group-hover:text-primary transition-colors line-clamp-1">{course.title}</h4>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <IconUsers size={12} /> {course.enrollments?.length || 0}
                          </span>
                          <span className="flex items-center gap-1">
                            <IconFileText size={12} /> {course.lessons?.length || 0} lessons
                          </span>
                          <Badge variant={course.status === 'published' ? 'default' : 'outline'} className="text-[10px] h-4 py-0">
                            {course.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/dashboard/teacher/courses/${course.course_id}`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                          <IconEdit size={16} />
                        </Button>
                      </Link>
                      <Link href={`/dashboard/teacher/courses/${course.course_id}/preview`}>
                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full">
                          <IconEye size={16} />
                        </Button>
                      </Link>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground">
                  <IconBook className="mx-auto h-12 w-12 opacity-10 mb-4" />
                  <p>No courses created yet.</p>
                  <Link href="/dashboard/teacher/courses/new">
                    <Button variant="link" className="mt-2">Create your first course</Button>
                  </Link>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="lg:col-span-3 border-none shadow-xl bg-card/50 backdrop-blur-sm ring-1 ring-border">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest enrollments and submissions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {recentEnrollments.length > 0 ? (
                recentEnrollments.map((activity: any, idx) => (
                  <div key={idx} className="flex items-start gap-4">
                    <div className="relative">
                      <div className="h-10 w-10 rounded-full bg-accent border flex items-center justify-center overflow-hidden">
                        {activity.profiles?.avatar_url ? (
                          <img src={activity.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <IconUsers className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background ring-1 ring-green-500/20" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        <span className="text-foreground">{activity.profiles?.full_name || 'Anonymous'}</span>
                        <span className="text-muted-foreground font-normal"> enrolled in </span>
                        <span className="text-primary font-semibold">{activity.courses?.title}</span>
                      </p>
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                        <IconCalendar size={10} />
                        {new Date(activity.enrollment_date).toLocaleDateString()} at{' '}
                        {new Date(activity.enrollment_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-muted-foreground italic text-sm">
                  No recent activity found.
                </div>
              )}
            </div>

            <div className="mt-8 p-4 rounded-xl bg-primary/5 border border-primary/10">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-1.5 bg-primary/10 rounded-lg">
                  <IconChartBar size={16} className="text-primary" />
                </div>
                <h4 className="text-sm font-semibold">Growth Tip</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Courses with AI-assisted exercises have 45% higher completion rates. Try adding tasks to your lessons!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
