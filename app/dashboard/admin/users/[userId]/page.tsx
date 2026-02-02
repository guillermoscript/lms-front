import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconUser,
  IconMail,
  IconCalendar,
  IconBook,
  IconCreditCard,
} from '@tabler/icons-react'
import { UserActions } from '@/components/admin/user-actions'

interface PageProps {
  params: Promise<{ userId: string }>
}

export default async function UserDetailPage({ params }: PageProps) {
  const { userId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (!profile) {
    notFound()
  }

  // Fetch user roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)

  const roles = userRoles?.map(r => r.role) || []

  // Fetch enrollments with course details
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select(`
      *,
      course:courses (
        course_id,
        title,
        status
      )
    `)
    .eq('user_id', userId)
    .order('enrolled_at', { ascending: false })

  // Fetch transactions
  const { data: transactions } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10)

  // Fetch recent lesson completions
  const { data: recentActivity } = await supabase
    .from('lesson_completions')
    .select(`
      completed_at,
      lesson:lessons (
        lesson_id,
        title,
        course:courses (
          course_id,
          title
        )
      )
    `)
    .eq('student_id', userId)
    .order('completed_at', { ascending: false })
    .limit(10)

  const isDeactivated = !!profile.deactivated_at

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin/users">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Back to Users
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <IconUser className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">
                  {profile.full_name || 'Unknown User'}
                </h1>
                <p className="mt-1 text-muted-foreground">{profile.email}</p>
              </div>
            </div>
            <UserActions
              userId={userId}
              userName={profile.full_name || profile.email}
              currentRoles={roles}
              isDeactivated={isDeactivated}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Profile Info */}
          <div className="space-y-6 lg:col-span-1">
            {/* Profile Details */}
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <IconMail className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <IconCalendar className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Joined</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(profile.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <IconUser className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">User ID</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {userId.slice(0, 20)}...
                    </p>
                  </div>
                </div>

                {profile.bio && (
                  <div>
                    <p className="text-sm font-medium mb-1">Bio</p>
                    <p className="text-sm text-muted-foreground">{profile.bio}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Roles */}
            <Card>
              <CardHeader>
                <CardTitle>Roles</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {roles.length > 0 ? (
                    roles.map((role) => (
                      <Badge
                        key={role}
                        variant={
                          role === 'admin'
                            ? 'default'
                            : role === 'teacher'
                              ? 'secondary'
                              : 'outline'
                        }
                      >
                        {role}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No roles assigned</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>Account Status</CardTitle>
              </CardHeader>
              <CardContent>
                {isDeactivated ? (
                  <div>
                    <Badge variant="destructive" className="mb-2">Deactivated</Badge>
                    <p className="text-sm text-muted-foreground">
                      Deactivated on {new Date(profile.deactivated_at).toLocaleDateString()}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Badge variant="outline" className="mb-2 bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      Account is active and in good standing
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Activity */}
          <div className="space-y-6 lg:col-span-2">
            {/* Enrollments */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconBook className="h-5 w-5" />
                  Enrollments ({enrollments?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollments && enrollments.length > 0 ? (
                  <div className="space-y-3">
                    {enrollments.map((enrollment: any) => (
                      <div
                        key={enrollment.enrollment_id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">{enrollment.course?.title}</p>
                          <p className="text-sm text-muted-foreground">
                            Enrolled {new Date(enrollment.enrolled_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={enrollment.status === 'active' ? 'default' : 'secondary'}
                        >
                          {enrollment.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No enrollments yet
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivity && recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((activity: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="font-medium">
                            Completed: {activity.lesson?.title}
                          </p>
                          <p className="text-muted-foreground">
                            {activity.lesson?.course?.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(activity.completed_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No recent activity
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconCreditCard className="h-5 w-5" />
                  Recent Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                {transactions && transactions.length > 0 ? (
                  <div className="space-y-3">
                    {transactions.map((transaction: any) => (
                      <div
                        key={transaction.transaction_id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div>
                          <p className="font-medium">
                            ${transaction.amount} {transaction.currency?.toUpperCase()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(transaction.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge
                          variant={
                            transaction.status === 'completed'
                              ? 'default'
                              : transaction.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {transaction.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No transactions yet
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
