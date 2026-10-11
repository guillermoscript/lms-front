'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors.generic')
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        <div className="text-6xl">📚</div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('description')}
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground font-mono">
            {t('reference')}: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('retry')}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
