import { getTranslations } from 'next-intl/server'
import { IconAlertCircle, IconCheck } from '@tabler/icons-react'

interface StripeConnectCardProps {
  accountId: string | null
}

/**
 * Stripe Connect status card shown in Settings→Payments, next to the
 * provider toggles, so payment setup lives on a single page (#434).
 */
export default async function StripeConnectCard({ accountId }: StripeConnectCardProps) {
  const t = await getTranslations('dashboard.admin.settings.sections.payment.connect')

  if (accountId) {
    return (
      <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-5 ring-1 ring-emerald-200 dark:ring-emerald-800">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
            <IconCheck className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
              {t('connectedTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">
              {t('connectedDesc')}
            </p>
            <p className="mt-1 font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              {accountId}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-5 ring-1 ring-amber-200 dark:ring-amber-800">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/50">
          <IconAlertCircle className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {t('notConnectedTitle')}
          </h3>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            {t('notConnectedDesc')}
          </p>
          {/* Plain <a>: this is an API redirect endpoint, not a page — Link would client-navigate */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/api/stripe/connect"
            className="mt-3 inline-flex items-center justify-center rounded-lg text-xs font-medium bg-amber-600 text-white hover:bg-amber-700 h-8 px-4 transition-colors"
          >
            {t('connectButton')}
          </a>
        </div>
      </div>
    </div>
  )
}
