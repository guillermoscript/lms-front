import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { IconAlertTriangle, IconLock } from '@tabler/icons-react'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { getAccessCutoffNotice } from '@/lib/billing/access-cutoff-notice'

/**
 * Persistent in-app warning shown to tenant admins while an access cutoff is
 * scheduled or in force (issue #517).
 *
 * Deliberately not dismissible: the thing it is counting down to is every
 * student at the school losing access to every course, and a dismissed
 * countdown is indistinguishable from no countdown. It also states the blast
 * radius in the same words as the email, so an admin who reads only one of
 * the two still learns that this is school-wide rather than per-student.
 *
 * Renders nothing when there is no cutoff, which is the overwhelmingly common
 * case — one indexed single-row read on the admin dashboard path.
 */
export async function AccessCutoffBanner() {
  const tenantId = await getCurrentTenantId()
  const notice = await getAccessCutoffNotice(tenantId)
  if (!notice) return null

  const [t, locale] = await Promise.all([
    getTranslations('components.accessCutoffBanner'),
    getLocale(),
  ])

  // Explicit locale: on the server `undefined` resolves to the Node process
  // locale, not the request's, so an /es page would render an English date.
  const cutoffDate = new Date(notice.cutoffAt).toLocaleDateString(locale, { dateStyle: 'long' })

  return (
    <div
      role="status"
      className={
        notice.active
          ? 'flex flex-wrap items-center gap-3 border-b border-destructive/50 bg-destructive/10 px-4 py-2.5 text-destructive'
          : 'flex flex-wrap items-center gap-3 border-b border-amber-500/50 bg-amber-50 px-4 py-2.5 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100'
      }
    >
      {notice.active ? (
        <IconLock className="h-5 w-5 shrink-0" aria-hidden="true" />
      ) : (
        <IconAlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
      )}

      <p className="min-w-0 flex-1 text-sm text-pretty">
        <span className="font-medium">
          {notice.active
            ? t('activeTitle')
            : notice.daysRemaining <= 1
              ? t('scheduledTitleImminent')
              : t('scheduledTitle', { days: notice.daysRemaining })}
        </span>{' '}
        {notice.active ? t('activeBody', { date: cutoffDate }) : t('scheduledBody', { date: cutoffDate })}
      </p>

      <Link
        href="/dashboard/admin/billing"
        className="shrink-0 rounded-md border border-current px-3 py-1.5 text-sm font-medium hover:opacity-80"
      >
        {notice.active ? t('restoreAccess') : t('manageBilling')}
      </Link>
    </div>
  )
}
