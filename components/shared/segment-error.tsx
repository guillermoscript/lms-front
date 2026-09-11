'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'
import { useTranslations } from 'next-intl'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'

/**
 * Shared body for a route-segment `error.tsx` (#677).
 *
 * Next renders `error.tsx` *inside* the surrounding layouts, so a page that
 * throws keeps its sidebar / navbar and only the panel is swapped for this.
 * The per-route files are one-line wrappers that pick the "back" target;
 * everything else — copy, digest, Sentry report — lives here so the sixteen
 * boundaries cannot drift apart.
 *
 * `Sentry.captureException` is a no-op without a DSN (see `sentry.*.config`),
 * and it is needed: React error boundaries swallow the error before the
 * global handler sees it, so `global-error.tsx` reports the same way.
 */
export type SegmentErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

type BackTarget = 'dashboard' | 'platform' | 'home' | 'login'

const BACK_HREF: Record<BackTarget, string> = {
  dashboard: '/dashboard',
  platform: '/platform',
  home: '/',
  login: '/auth/login',
}

export function SegmentError({
  error,
  reset,
  back = 'dashboard',
  backHref,
}: SegmentErrorProps & {
  /** Which label/target the secondary button uses. */
  back?: BackTarget
  /** Override the href while keeping the label of `back`. */
  backHref?: string
}) {
  const t = useTranslations('errors.panel')

  useEffect(() => {
    console.error(error)
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      role="alert"
      data-testid="segment-error"
      className="flex flex-1 flex-col items-center justify-center p-6 text-center"
    >
      <div className="max-w-sm">
        <IconAlertTriangle
          className="mx-auto mb-4 size-8 text-muted-foreground"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('reference', { code: error.digest })}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <Button onClick={reset}>{t('retry')}</Button>
          <Button variant="outline" render={<Link href={backHref ?? BACK_HREF[back]} />}>
            {t(`back.${back}`)}
          </Button>
        </div>
      </div>
    </div>
  )
}
