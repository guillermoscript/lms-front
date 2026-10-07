import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconSparkles } from '@tabler/icons-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** Admin dashboard nudge shown while the school has no active AI provider key. Server component, no data of its own. */
export async function AiKeyBanner() {
  const t = await getTranslations('aiSettings.banner')

  return (
    <Alert data-testid="ai-key-banner">
      <IconSparkles aria-hidden />
      <AlertTitle>{t('title')}</AlertTitle>
      <AlertDescription>{t('description')}</AlertDescription>
      <div className="mt-2 col-start-2 first:col-start-1">
        <Link href="/dashboard/admin/settings/ai">
          <Button size="sm">{t('action')}</Button>
        </Link>
      </div>
    </Alert>
  )
}
