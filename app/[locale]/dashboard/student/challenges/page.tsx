import { getTranslations } from 'next-intl/server'
import { PageHeader, PageShell } from '@/components/dashboard/page-shell'
import { ChallengeLinksList } from '@/components/challenges/challenge-links-list'

export default async function MyChallengeLinksPage() {
  const t = await getTranslations('challenges.admin.links')
  return (
    <PageShell variant="reading">
      <PageHeader title={t('title')} description={t('description')} />
      <ChallengeLinksList />
    </PageShell>
  )
}
