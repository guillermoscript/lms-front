import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  IconUser,
  IconShield,
} from '@tabler/icons-react'
import { UsersTable } from '@/components/admin/users-table'
import { InviteUserDialog } from '@/components/admin/invite-user-dialog'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb'
import { getSchoolJoinUrl } from '@/app/actions/admin/invitations'

export default async function AdminUsersPage() {
  const t = await getTranslations('dashboard.admin.users')
  const tBreadcrumbs = await getTranslations('dashboard.admin.breadcrumbs')
  const supabase = createAdminClient()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const tenantId = await getCurrentTenantId()

  // Get tenant members first (needed for profile lookup)
  const { data: tenantMembers } = await supabase
    .from('tenant_users')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  const memberUserIds = tenantMembers?.map((m) => m.user_id) || []

  // Parallelize: profiles, enrollments, and joinUrl are independent
  const adminClient = createAdminClient()
  const [{ data: rawProfiles }, { data: enrollments }, joinUrl] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .in('id', memberUserIds.length > 0 ? memberUserIds : ['00000000-0000-0000-0000-000000000000'])
      .order('created_at', { ascending: false }),
    supabase
      .from('enrollments')
      .select('user_id')
      .eq('tenant_id', tenantId),
    getSchoolJoinUrl(),
  ])

  // Get emails from auth.users via admin client
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

  const enrollmentCounts = new Map<string, number>()
  enrollments?.forEach((e) => {
    enrollmentCounts.set(e.user_id, (enrollmentCounts.get(e.user_id) || 0) + 1)
  })

  return (
    <div className="space-y-6 p-6 lg:p-8" data-testid="users-page">
      <AdminBreadcrumb
        items={[
          { label: tBreadcrumbs('admin'), href: '/dashboard/admin' },
          { label: tBreadcrumbs('users') },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <InviteUserDialog joinUrl={joinUrl} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <IconUser className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">{profiles?.length || 0}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('stats.totalUsers')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <IconShield className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">
              {Array.from(rolesMap.values()).filter((roles) => roles.includes('teacher')).length}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('stats.teachers')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <IconUser className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight">
              {Array.from(rolesMap.values()).filter((roles) => roles.includes('student')).length}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('stats.students')}</p>
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
    </div>
  )
}
