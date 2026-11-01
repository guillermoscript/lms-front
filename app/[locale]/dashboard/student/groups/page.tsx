import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CreateGroupForm } from '@/components/challenges/groups/create-group-form'
import { listMyGroups, loadGroupsEnabled } from '@/lib/challenges/groups'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export const dynamic = 'force-dynamic'

// proxy.ts keeps non-students out of /dashboard/student.
export default async function StudentGroupsPage() {
  const [role, userId, tenantId, t] = await Promise.all([
    getUserRole(), getCurrentUserId(), getCurrentTenantId(), getTranslations('challenges.groups'),
  ])
  if (role !== 'student') redirect('/dashboard')
  if (!userId) redirect('/auth/login')
  const admin = createAdminClient()
  const enabled = await loadGroupsEnabled(admin, tenantId)
  const groups = enabled ? await listMyGroups(admin, tenantId, userId) : []

  return (
    <PageShell variant="reading">
      <PageHeader title={t('title')} description={t('description')} />
      {!enabled ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground" data-testid="groups-disabled">{t('disabled')}</p>
      ) : (
        <>
          {groups.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground" data-testid="groups-empty">{t('empty')}</p>
          ) : (
            <ul className="space-y-3" data-testid="groups-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <Link
                    href={`/dashboard/student/groups/${g.id}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    data-testid="group-item"
                  >
                    <span className="font-medium">{g.name}</span>
                    <span className="text-sm text-muted-foreground">{t('members', { count: g.memberCount })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">{t('createTitle')}</CardTitle></CardHeader>
            <CardContent><CreateGroupForm /></CardContent>
          </Card>
        </>
      )}
    </PageShell>
  )
}
