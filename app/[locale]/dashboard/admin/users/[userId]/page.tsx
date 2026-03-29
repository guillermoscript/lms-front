import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { format } from 'date-fns'
import { es, enUS } from 'date-fns/locale'
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
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

interface PageProps {
  params: Promise<{ userId: string; locale: string }>
}

export default async function UserDetailPage({ params }: PageProps) {
  const { userId, locale } = await params
  const t = await getTranslations('dashboard.admin.users.details')
  const tu = await getTranslations('dashboard.admin.users.table')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const dateLocale = locale === 'es' ? es : enUS
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Verify user belongs to this tenant
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .single()

  if (!membership) {
    notFound()
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

  const roles = [membership.role]

  // Parallelize 3 independent queries (all need userId + tenantId)
  const [{ data: enrollments }, { data: transactions }, { data: recentActivity }] = await Promise.all([
    supabase.from('enrollments').select(`
      *,
      course:courses (
        course_id,
        title,
        status
      )
    `)
      .eq('user_id', userId).eq('tenant_id', tenantId)
      .order('enrolled_at', { ascending: false }),
    supabase.from('transactions').select('*')
      .eq('user_id', userId).eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(10),
    supabase.from('lesson_completions').select(`
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
      .eq('user_id', userId).eq('tenant_id', tenantId)
      .order('completed_at', { ascending: false }).limit(10),
  ])

  const isDeactivated = !!profile.deactivated_at

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: t('breadcrumbs.admin'), href: '/dashboard/admin' },
                { label: t('breadcrumbs.users'), href: '/dashboard/admin/users' },
                { label: t('breadcrumbs.userDetails') },
              ]}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <IconUser className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-bold md:text-3xl">
                  {profile.full_name || t('unknown')}
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
                <CardTitle>{t('profile')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <IconMail className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('email')}</p>
                    <p className="text-sm text-muted-foreground">{profile.email}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <IconCalendar className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('joined')}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(profile.created_at), 'MMMM d, yyyy', { locale: dateLocale })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <IconUser className="mt-1 h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{t('userId')}</p>
                    <p className="text-sm text-muted-foreground font-mono">
                      {userId.slice(0, 20)}...
                    </p>
                  </div>
                </div>

                {profile.bio && (
                  <div>
                    <p className="text-sm font-medium mb-1">{t('bio')}</p>
                    <p className="text-sm text-muted-foreground">{profile.bio}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Roles */}
            <Card>
              <CardHeader>
                <CardTitle>{t('roles')}</CardTitle>
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
                        {tu(`roles.${role}`)}
                      </Badge>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('rolesPlaceholder')}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card>
              <CardHeader>
                <CardTitle>{t('status')}</CardTitle>
              </CardHeader>
              <CardContent>
                {isDeactivated ? (
                  <div>
                    <Badge variant="destructive" className="mb-2">{t('statusDeactivated')}</Badge>
                    <p className="text-sm text-muted-foreground">
                      {t('statusDeactivatedDesc', { date: format(new Date(profile.deactivated_at!), 'P', { locale: dateLocale }) })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <Badge variant="outline" className="mb-2 bg-green-50 text-green-700 border-green-200">
                      {t('statusActive')}
                    </Badge>
                    <p className="text-sm text-muted-foreground">
                      {t('statusActiveDesc')}
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
                  {t('enrollments', { count: enrollments?.length || 0 })}
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
                            {t('enrolled', { date: format(new Date(enrollment.enrolled_at), 'P', { locale: dateLocale }) })}
                          </p>
                        </div>
                        <Badge
                          variant={enrollment.status === 'active' ? 'default' : 'secondary'}
                        >
                          {tu(`status.${enrollment.status}`) || enrollment.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {t('noEnrollments')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>{t('recentActivity')}</CardTitle>
              </CardHeader>
              <CardContent>
                {recentActivity && recentActivity.length > 0 ? (
                  <div className="space-y-3">
                    {recentActivity.map((activity: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 h-2 w-2 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="font-medium">
                            {t('completed', { title: activity.lesson?.title })}
                          </p>
                          <p className="text-muted-foreground">
                            {activity.lesson?.course?.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.completed_at), 'PP', { locale: dateLocale })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {t('noActivity')}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Transactions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconCreditCard className="h-5 w-5" />
                  {t('recentTransactions')}
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
                            {new Intl.NumberFormat(locale, { style: 'currency', currency: transaction.currency?.toUpperCase() || 'USD' }).format(transaction.amount)}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(transaction.created_at), 'P', { locale: dateLocale })}
                          </p>
                        </div>
                        <Badge
                          variant={
                            transaction.status === 'completed' || transaction.status === 'successful'
                              ? 'default'
                              : transaction.status === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {tu(`status.${transaction.status}`) || transaction.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {t('noTransactions')}
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
