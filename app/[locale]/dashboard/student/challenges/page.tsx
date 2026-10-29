import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { ChallengeLinksList } from '@/components/challenges/challenge-links-list'
import { getUserRole } from '@/lib/supabase/get-user-role'

// proxy.ts keeps non-students out of /dashboard/student; teachers and admins
// manage links from the admin settings card (admins) — teacher access is a
// known MVP limitation.
export default async function MyChallengeLinksPage() {
  const role = await getUserRole()
  if (role !== 'student') redirect('/dashboard')
  const t = await getTranslations('challenges.admin.links')
  return (
    <PageShell variant="reading">
      <PageHeader title={t('title')} description={t('description')} />
      <ChallengeLinksList />
    </PageShell>
  )
}
