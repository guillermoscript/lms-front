'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

export default function TeacherError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('dashboard.teacher.error')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <div className="flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 dark:bg-destructive/20">
            <IconAlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>
        <h1 className="text-xl font-semibold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            {t('reference', { digest: error.digest })}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button onClick={reset}>
            {t('tryAgain')}
          </Button>
          <Link href="/dashboard">
            <Button variant="outline">
              {t('dashboard')}
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
