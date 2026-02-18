'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-8xl font-bold text-destructive">500</span>
        </div>
        <h1 className="text-2xl font-semibold mb-3">{t('generic.title')}</h1>
        <p className="text-muted-foreground mb-8">{t('generic.description')}</p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-6 font-mono">
            {t('generic.reference')}: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('generic.retry')}
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('generic.backToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
