import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GroupLeaderboard } from '@/components/challenges/groups/group-leaderboard'
import { GroupChallengeCard } from '@/components/challenges/groups/group-challenge-card'
import { InviteShare } from '@/components/challenges/groups/invite-share'
import { LaunchChallengeForm } from '@/components/challenges/groups/launch-challenge-form'
import { listLaunchableExercises, loadGroupView } from '@/lib/challenges/groups'
import { fetchAccessibleCourseIds } from '@/lib/services/course-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Props = { params: Promise<{ groupId: string }> }

export default async function GroupPage({ params }: Props) {
  const { groupId } = await params
  const [role, userId, tenantId, t] = await Promise.all([
    getUserRole(), getCurrentUserId(), getCurrentTenantId(), getTranslations('challenges.groups'),
  ])
  if (role !== 'student') redirect('/dashboard')
  if (!userId) redirect('/auth/login')
  if (!UUID.test(groupId)) notFound()

  const admin = createAdminClient()
  // Members only; another school's group or a non-member is a plain 404.
  const view = await loadGroupView(admin, tenantId, userId, groupId)
  if (!view) notFound()

  const courseIds = [...(await fetchAccessibleCourseIds(admin, userId, tenantId))]
  const options = await listLaunchableExercises(admin, tenantId, groupId, courseIds)
  const capReached = view.caps.launchedThisMonth >= view.caps.challengesPerMonth

  return (
    <PageShell variant="reading">
      <PageHeader
        title={view.group.name}
        description={t('page.membersCount', { count: view.memberCount, max: view.caps.members })}
        actions={<Button variant="outline" size="sm" render={<Link href="/dashboard/student/groups" />}>{t('page.backToGroups')}</Button>}
      />

      <section aria-labelledby="group-ranking" className="space-y-3">
        <h2 id="group-ranking" className="text-lg font-bold">{t('page.leaderboard')}</h2>
        <GroupLeaderboard rows={view.leaderboard} />
      </section>

      <section aria-labelledby="group-challenges" className="space-y-3">
        <h2 id="group-challenges" className="text-lg font-bold">{t('page.challenges')}</h2>
        {view.challenges.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground" data-testid="group-challenges-empty">{t('page.noChallenges')}</p>
        ) : (
          view.challenges.map((c) => <GroupChallengeCard key={c.id} challenge={c} />)
        )}
      </section>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('page.launchTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('page.launchHint')}</p>
          <p className="text-xs text-muted-foreground">{t('page.launchedThisMonth', { used: view.caps.launchedThisMonth, max: view.caps.challengesPerMonth })}</p>
          <LaunchChallengeForm groupId={groupId} options={options} disabled={capReached} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t('invite.title')}</CardTitle></CardHeader>
        <CardContent><InviteShare token={view.group.inviteToken} groupName={view.group.name} /></CardContent>
      </Card>
    </PageShell>
  )
}
