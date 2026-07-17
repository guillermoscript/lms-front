import { getTranslations } from 'next-intl/server'
import { IconAlertCircle, IconCheck, IconProgress } from '@tabler/icons-react'

interface StripeConnectCardProps {
  accountId: string | null
  chargesEnabled?: boolean
  detailsSubmitted?: boolean
  payoutsEnabled?: boolean
}

/**
 * Stripe Connect status card shown in Settings→Payments, next to the
 * provider toggles, so payment setup lives on a single page (#434).
 *
 * Express accounts onboard progressively (#439), so having an account id no
 * longer means the school can charge — three states: not connected, setup
 * incomplete (resume link), and charges enabled.
 */
export default async function StripeConnectCard({
  accountId,
  chargesEnabled = false,
  detailsSubmitted = false,
  payoutsEnabled = false,
}: StripeConnectCardProps) {
  const t = await getTranslations('dashboard.admin.settings.sections.payment.connect')

  if (accountId && chargesEnabled) {
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
            {!payoutsEnabled && (
              <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                {t('payoutsPending')}
              </p>
            )}
            <p className="mt-1 font-mono text-[11px] text-emerald-700/80 dark:text-emerald-400/80">
              {accountId}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (accountId) {
    // Account exists but onboarding is incomplete — the Account Link resumes
    // where the admin left off (Express progressive KYC).
    return (
      <div className="rounded-xl bg-sky-50 dark:bg-sky-950/30 p-5 ring-1 ring-sky-200 dark:ring-sky-800">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/50">
            <IconProgress className="h-[18px] w-[18px] text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-sky-900 dark:text-sky-200">
              {t('pendingTitle')}
            </h3>
            <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-400">
              {detailsSubmitted ? t('pendingReviewDesc') : t('pendingDesc')}
            </p>
            {!detailsSubmitted && (
              /* Plain <a>: this is an API redirect endpoint, not a page — Link would client-navigate */
              /* eslint-disable-next-line @next/next/no-html-link-for-pages */
              <a
                href="/api/stripe/connect"
                className="mt-3 inline-flex items-center justify-center rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 h-8 px-4 transition-colors"
              >
                {t('resumeButton')}
              </a>
            )}
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
