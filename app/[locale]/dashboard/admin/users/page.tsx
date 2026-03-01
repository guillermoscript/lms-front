import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'

export default async function AdminUsersPage() {
  const t = await getTranslations('dashboard.admin.users')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Get tenant members first, then fetch their profiles
  const { data: tenantMembers } = await supabase
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  const memberUserIds = tenantMembers?.map((m) => m.user_id) || []

  // Get profiles only for users in this tenant
  const { data: rawProfiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', memberUserIds.length > 0 ? memberUserIds : ['00000000-0000-0000-0000-000000000000'])
    .order('created_at', { ascending: false })

  // Get emails from auth.users via admin client
  const adminClient = createAdminClient()
  const profiles = await Promise.all(
    (rawProfiles || []).map(async (p) => {
      const { data } = await adminClient.auth.admin.getUserById(p.id)
      return { ...p, email: data?.user?.email || '' }
    })
  )

  // Build roles map from tenant_users (authoritative for this tenant)
  const rolesMap = new Map<string, string[]>()
  tenantMembers?.forEach((m) => {
    const existing = rolesMap.get(m.user_id) || []
    rolesMap.set(m.user_id, [...existing, m.role])
  })

  // Get enrollment counts (filtered by tenant)
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('user_id')
    .eq('tenant_id', tenantId)

  const enrollmentCounts = new Map<string, number>()
  enrollments?.forEach((e) => {
    enrollmentCounts.set(e.user_id, (enrollmentCounts.get(e.user_id) || 0) + 1)
  })

  return (
    <div className="min-h-screen bg-background" data-testid="users-page">
      <header className="border-b bg-card">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-4">
            <AdminBreadcrumb
              items={[
                { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
                { label: tBreadcrumbs('users') },
              ]}
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.totalUsers')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">{profiles?.length || 0}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/40">
                  <IconUser className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.teachers')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">
                    {Array.from(rolesMap.values()).filter((roles) => roles.includes('teacher')).length}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
                  <IconShield className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('stats.students')}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight">
                    {Array.from(rolesMap.values()).filter((roles) => roles.includes('student')).length}
                  </p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-950/40">
                  <IconUser className="h-[18px] w-[18px] text-violet-600 dark:text-violet-400" strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

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
