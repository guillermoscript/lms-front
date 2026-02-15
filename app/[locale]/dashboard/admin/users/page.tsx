import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  IconArrowLeft,
  IconUser,
  IconShield,
} from '@tabler/icons-react'
import { UsersTable } from '@/components/admin/users-table'

export default async function AdminUsersPage() {
  const t = await getTranslations('dashboard.admin.users')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get all users with their roles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  // Get all user roles
  const { data: userRoles } = await supabase
    .from('user_roles')
    .select('user_id, role')

  // Create a map of user roles
  const rolesMap = new Map<string, string[]>()
  userRoles?.forEach((ur) => {
    const existing = rolesMap.get(ur.user_id) || []
    rolesMap.set(ur.user_id, [...existing, ur.role])
  })

  // Get enrollment counts
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id')

  const enrollmentCounts = new Map<string, number>()
  enrollments?.forEach((e) => {
    enrollmentCounts.set(e.user_id, (enrollmentCounts.get(e.user_id) || 0) + 1)
  })

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/admin">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              {t('backToDashboard')}
            </Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold md:text-3xl">{t('title')}</h1>
              <p className="mt-1 text-muted-foreground">
                {t('description')}
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
                  <p className="text-sm text-muted-foreground">{t('stats.totalUsers')}</p>
                  <p className="mt-2 text-3xl font-bold">{profiles?.length || 0}</p>
                </div>
                <IconUser className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.teachers')}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {Array.from(rolesMap.values()).filter((roles) =>
                      roles.includes('teacher')
                    ).length}
                  </p>
                </div>
                <IconShield className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('stats.students')}</p>
                  <p className="mt-2 text-3xl font-bold">
                    {Array.from(rolesMap.values()).filter((roles) =>
                      roles.includes('student')
                    ).length}
                  </p>
                </div>
                <IconUser className="h-10 w-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>{t('table.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <UsersTable
              profiles={profiles || []}
              rolesMap={rolesMap}
              enrollmentCounts={enrollmentCounts}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
