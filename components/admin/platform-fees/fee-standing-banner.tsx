import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { IconAlertTriangle, IconClock, IconLock } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { loadFeeBannerNotice } from '@/lib/billing/platform-fee-account'
import { formatByCurrency } from '@/lib/payments/format-money'
import { cn } from '@/lib/utils'

/**
 * Slim platform-fee banner in the admin dashboard shell (#929, design 4.4).
 * Admins only (the layout mounts it for `role === 'admin'`); students never
 * learn about the school's fee debt.
 *
 * Renders nothing while the standing is `ok`, while nothing is owed, or when
 * the standing cannot be read (fail open: never a wrong state). Not
 * dismissible, like the access-cutoff banner: it is counting down to a sales
 * pause.
 */
export async function FeeStandingBanner() {
  const tenantId = await getCurrentTenantId()
  const notice = await loadFeeBannerNotice(createAdminClient(), tenantId)
  if (!notice) return null

  const [t, locale] = await Promise.all([getTranslations('platformFees.banner'), getLocale()])
  const amount = formatByCurrency(notice.owed, locale)
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(iso))

  const severe = notice.variant !== 'reminded'
  const Icon = notice.variant === 'blocked' ? IconLock : notice.variant === 'overdue' ? IconAlertTriangle : IconClock

  let title: string
  let body: string
  if (notice.variant === 'blocked') {
    title = t('blockedTitle')
    body = t('blockedBody', { amount })
  } else if (notice.variant === 'overdue') {
    title = t('overdueTitle')
    body = notice.blockOn ? t('overdueBodyBlockOn', { amount, date: fmtDate(notice.blockOn) }) : t('overdueBody', { amount })
  } else {
    title = t('remindedTitle')
    body = notice.dueAt ? t('remindedBody', { amount, date: fmtDate(notice.dueAt) }) : t('remindedBodyNoDate', { amount })
  }

  return (
    <div
      role="status"
      data-testid="fee-standing-banner"
      data-variant={notice.variant}
      className={cn(
        'flex flex-wrap items-center gap-3 border-b px-4 py-2.5 print:hidden',
        severe ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-warning/50 bg-warning/10 text-warning',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm text-pretty">
        <span className="font-medium">{title}</span> {body}
      </p>
      <Link
        href="/dashboard/admin/earnings#platform-fees"
        className="shrink-0 rounded-md border border-current px-3 py-1.5 text-sm font-medium hover:opacity-80"
      >
        {t('action')}
      </Link>
    </div>
  )
}
