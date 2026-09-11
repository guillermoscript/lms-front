import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconFileUnknown } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/**
 * #677: `notFound()` thrown anywhere under /dashboard used to fall through to
 * the public, full-screen 404 — no sidebar, no way back. This one renders
 * inside `dashboard/layout.tsx`, so the shell stays put.
 */
export default async function DashboardNotFound() {
  const t = await getTranslations('errors.notFound')

  return (
    <div
      data-testid="dashboard-not-found"
      className="flex flex-1 flex-col items-center justify-center p-6 text-center"
    >
      <div className="max-w-sm">
        <IconFileUnknown
          className="mx-auto mb-4 size-8 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="font-mono text-xs font-medium uppercase tracking-[0.3em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        <div className="mt-6 flex justify-center">
          <Button render={<Link href="/dashboard" />}>{t('backToDashboard')}</Button>
        </div>
      </div>
    </div>
  )
}
