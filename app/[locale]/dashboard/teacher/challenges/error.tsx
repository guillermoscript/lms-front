'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/dashboard/page-shell'

export default function ChallengesError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('challenges.staff')
  return (
    <PageShell variant="reading">
      <p role="alert" className="text-sm">{t('loadError')}</p>
      <Button variant="outline" onClick={reset}>{t('retry')}</Button>
    </PageShell>
  )
}
