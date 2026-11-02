'use client'

import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/dashboard/page-shell'

export default function GroupsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('challenges.groups')
  return (
    <PageShell variant="reading">
      <p role="alert" className="text-sm">{t('error')}</p>
      <Button variant="outline" onClick={reset}>{t('retry')}</Button>
    </PageShell>
  )
}
