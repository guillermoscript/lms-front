import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export default async function NotFound() {
  const t = await getTranslations('errors')

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-8xl font-bold text-primary">404</span>
        </div>
        <h1 className="text-2xl font-semibold mb-3">{t('notFound.title')}</h1>
        <p className="text-muted-foreground mb-8">{t('notFound.description')}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t('notFound.backToDashboard')}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('notFound.goHome')}
          </Link>
        </div>
      </div>
    </div>
  )
}
