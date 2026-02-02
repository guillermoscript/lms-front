import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconCertificate,
  IconCheck,
  IconClock,
} from '@tabler/icons-react'

export default async function AdminEnrollmentsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all enrollments
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('*, user_id, course_id')
    .order('enrollment_date', { ascending: false })

  // Get user profiles
  const userIds = enrollments?.map((e) => e.user_id) || []
  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const usersMap = new Map(users?.map((u) => [u.id, u]))

  // Get courses
  const courseIds = enrollments?.map((e) => e.course_id) || []
  const { data: courses } = await supabase
    .from('courses')
    .select('course_id, title')
    .in('course_id', courseIds)

  const coursesMap = new Map(courses?.map((c) => [c.course_id, c]))

  const activeCount = enrollments?.filter((e) => e.status === 'active').length || 0
  const completedCount = enrollments?.filter((e) => e.status === 'completed').length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">Enrollments</h1>
              <p className="mt-1 text-muted-foreground">
                View all student course enrollments
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
                  <p className="text-sm text-muted-foreground">Total Enrollments</p>
                  <p className="mt-2 text-3xl font-bold">{enrollments?.length || 0}</p>
                </div>
                <IconCertificate className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="mt-2 text-3xl font-bold">{activeCount}</p>
                </div>
                <IconClock className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="mt-2 text-3xl font-bold">{completedCount}</p>
                </div>
                <IconCheck className="h-10 w-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enrollments Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Enrollments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b">
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="pb-3 font-medium">Student</th>
                    <th className="pb-3 font-medium">Course</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Enrolled</th>
                    <th className="pb-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {enrollments && enrollments.length > 0 ? (
                    enrollments.map((enrollment) => {
                      const user = usersMap.get(enrollment.user_id)
                      const course = coursesMap.get(enrollment.course_id)

                      return (
                        <tr key={enrollment.enrollment_id} className="text-sm">
                          <td className="py-4">
                            <div>
                              <p className="font-medium">{user?.full_name || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">
                                {user?.email}
                              </p>
                            </div>
                          </td>
                          <td className="py-4">
                            <p className="font-medium line-clamp-1">
                              {course?.title || 'Unknown Course'}
                            </p>
                          </td>
                          <td className="py-4">
                            <Badge
                              variant={
                                enrollment.status === 'active'
                                  ? 'default'
                                  : enrollment.status === 'completed'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {enrollment.status}
                            </Badge>
                          </td>
                          <td className="py-4 text-muted-foreground">
                            {new Date(enrollment.enrollment_date).toLocaleDateString()}
                          </td>
                          <td className="py-4">
                            <Link
                              href={`/dashboard/student/courses/${enrollment.course_id}`}
                            >
                              <Button variant="ghost" size="sm">
                                View Course
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      )
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No enrollments found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
