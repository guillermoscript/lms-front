import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ClaimCta } from '@/components/challenges/claim-cta'
import { JoinGroupButton } from '@/components/challenges/groups/join-group-button'
import { Button } from '@/components/ui/button'
import { loadGroupInvite, schoolMemberStatus } from '@/lib/challenges/groups'
import { joinSchoolPath } from '@/lib/auth/route-access'
import { publicChallengePath } from '@/lib/challenges/routes'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getSchoolBrand } from '@/lib/themes/school-brand'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ token: string; locale: string }> }

export const metadata: Metadata = { robots: { index: false, follow: false } }

/**
 * Invite landing for a friend group (epic #1049, #1050). Guest: group name,
 * members (first name + initial), open challenges and sign-in. Signed in but not
 * a school member: the join-school hop, then back here. Active member: one tap.
 */
export default async function GroupInvitePage({ params }: Props) {
  const { token } = await params
  const tenantId = await getCurrentTenantId()
  const admin = createAdminClient()
  const [invite, userId, t] = await Promise.all([
    loadGroupInvite(admin, tenantId, token),
    getCurrentUserId(),
    getTranslations('challenges.groups'),
  ])
  if (!invite) notFound()

  const returnTo = `/grupo/${encodeURIComponent(token)}`
  const status = userId ? await schoolMemberStatus(admin, tenantId, userId) : null
  // Signed in without a membership: become a school member first, then return here.
  if (userId && status === null) redirect(joinSchoolPath(returnTo))

  let role: string | null = null
  if (userId && status === 'active') {
    role = await getUserRole()
    const { data: row } = await admin
      .from('challenge_group_members')
      .select('user_id')
      .eq('group_id', invite.groupId)
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle()
    if (row && role === 'student') redirect(`/dashboard/student/groups/${invite.groupId}`)
  }
  const brand = await getSchoolBrand(tenantId)

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight" data-testid="group-invite-title">{t('join.title', { group: invite.name })}</h1>
        <p className="text-sm text-muted-foreground">{t('join.subtitle', { count: invite.memberCount })}</p>
      </header>

      {invite.members.length > 0 && (
        <section aria-labelledby="invite-members" className="space-y-2">
          <h2 id="invite-members" className="text-sm font-semibold">{t('join.membersTitle')}</h2>
          <p className="text-sm" data-testid="group-invite-members">{invite.members.map((m) => m || t('student')).join(', ')}</p>
        </section>
      )}

      {invite.challenges.length > 0 && (
        <section aria-labelledby="invite-challenges" className="space-y-2">
          <h2 id="invite-challenges" className="text-sm font-semibold">{t('join.challengesTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('join.challengesHint')}</p>
          <ul className="space-y-2">
            {invite.challenges.map((c) => (
              <li key={c.linkToken} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <span className="text-sm font-medium">{c.title}</span>
                <Button size="sm" variant="outline" data-testid="group-invite-play" render={<Link href={publicChallengePath(c.linkToken)} />}>
                  {t('join.play')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-lg border p-4">
        {status === 'banned' ? (
          <p role="alert" className="text-sm">{t('join.banned')}</p>
        ) : status === 'active' && role !== 'student' ? (
          <p className="text-sm">{t('join.staffOnly')}</p>
        ) : status === 'active' ? (
          <JoinGroupButton token={token} />
        ) : (
          <>
            <h2 className="text-base font-semibold">{t('join.signInTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('join.signInHint')}</p>
            <ClaimCta token={token} schoolName={brand.name} nextPath={returnTo} />
          </>
        )}
      </section>
    </main>
  )
}
