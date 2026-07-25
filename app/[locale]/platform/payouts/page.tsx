import type { ComponentType } from 'react'
import { getTranslations } from 'next-intl/server'
import { getPayoutsOwed } from '@/app/actions/platform/payouts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MarkPayoutPaidDialog } from '@/components/platform/mark-payout-paid-dialog'
import { formatByCurrency, formatMoney } from '@/lib/payments/format-money'
import {
  IconArrowBackUp,
  IconCoin,
  IconReceiptRefund,
  IconReportMoney,
  IconWalletOff,
} from '@tabler/icons-react'

// `formatMoney` / `formatByCurrency` live in lib/payments/format-money.ts — the
// no-cross-currency-sums rule this page established in #497 is shared with the
// school-facing payout history rather than re-derived there (#531).

const PROVIDER_LABEL: Record<string, string> = {
  paypal: 'PayPal',
  binance: 'Binance Pay',
  lemonsqueezy: 'Lemon Squeezy',
}

interface ReportedAmountProps {
  amount: number
  formatted: string
  hint: string
}

/**
 * Shared shape of the two reporting-only money columns ("Of which refunded" and
 * "Overpaid"). Both name a figure that `Owed` already accounts for, both need an
 * explanation attached, and neither is ever negative — so they render the same
 * way and differ only in wording, icon and tone.
 *
 * The icon is not decoration: colour alone can't separate these two columns for
 * a colour-blind operator (WCAG 1.4.1), and they sit in a table of otherwise
 * neutral numbers.
 */
function ReportedAmountCell({
  amount,
  formatted,
  hint,
  className,
  icon: Icon,
  testId,
}: ReportedAmountProps & {
  className: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  testId: string
}) {
  return (
    <td className="py-2.5 text-right tabular-nums" data-testid={testId}>
      {amount > 0 ? (
        <span
          className={`inline-flex items-center justify-end gap-1 font-medium ${className}`}
          title={hint}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {formatted}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      )}
    </td>
  )
}

/**
 * The slice of "Paid so far" that covered sales since refunded. Not a deduction
 * column: "Owed" already accounts for it (#511), so it carries no minus sign.
 */
function ClawbackCell(props: ReportedAmountProps) {
  return (
    <ReportedAmountCell
      {...props}
      className="text-red-600 dark:text-red-400"
      icon={IconReceiptRefund}
      testId="payout-clawback-cell"
    />
  )
}

/**
 * Paid past the outstanding balance (#516). Recovered by carry-forward, not by a
 * reverse payout row — `payouts.amount` is CHECK (amount > 0) — so it shrinks on
 * its own as new sales land, but only for a school that keeps selling.
 */
function OverpaidCell(props: ReportedAmountProps) {
  return (
    <ReportedAmountCell
      {...props}
      className="text-sky-600 dark:text-sky-400"
      icon={IconArrowBackUp}
      testId="payout-overpaid-cell"
    />
  )
}

export default async function PlatformPayoutsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations('platform.payouts')
  const owed = await getPayoutsOwed()

  // Per-currency totals across all tenants — kept separate, never summed together.
  const totalOwedByCurrency: Record<string, number> = {}
  const totalCollectedByCurrency: Record<string, number> = {}
  const totalPaidOutByCurrency: Record<string, number> = {}
  let schoolsOwed = 0

  // One row per (tenant, currency) balance — a tenant with both USD and EUR
  // sales gets two rows, not one summed row.
  type Row = {
    tenantId: string
    tenantName: string
    schoolPercentage: number
    currency: string
    grossCollected: number
    alreadyPaid: number
    clawback: number
    netOwed: number
    overpaid: number
    byProvider: Record<string, number>
  }
  const rows: Row[] = []
  const totalClawbackByCurrency: Record<string, number> = {}
  const totalOverpaidByCurrency: Record<string, number> = {}

  for (const tenant of owed) {
    let tenantHasOwed = false
    for (const balance of tenant.balances) {
      totalOwedByCurrency[balance.currency] = (totalOwedByCurrency[balance.currency] ?? 0) + balance.netOwed
      totalCollectedByCurrency[balance.currency] = (totalCollectedByCurrency[balance.currency] ?? 0) + balance.grossCollected
      totalPaidOutByCurrency[balance.currency] = (totalPaidOutByCurrency[balance.currency] ?? 0) + balance.alreadyPaid
      if (balance.clawback > 0) {
        totalClawbackByCurrency[balance.currency] = (totalClawbackByCurrency[balance.currency] ?? 0) + balance.clawback
      }
      if (balance.overpaid > 0) {
        totalOverpaidByCurrency[balance.currency] = (totalOverpaidByCurrency[balance.currency] ?? 0) + balance.overpaid
      }
      if (balance.netOwed > 0) tenantHasOwed = true
      rows.push({
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        schoolPercentage: tenant.schoolPercentage,
        currency: balance.currency,
        grossCollected: balance.grossCollected,
        alreadyPaid: balance.alreadyPaid,
        clawback: balance.clawback,
        netOwed: balance.netOwed,
        overpaid: balance.overpaid,
        byProvider: balance.byProvider,
      })
    }
    if (tenantHasOwed) schoolsOwed++
  }
  const hasClawbacks = Object.values(totalClawbackByCurrency).some((amount) => amount > 0)
  const hasOverpayments = Object.values(totalOverpaidByCurrency).some((amount) => amount > 0)

  const metricCards = [
    {
      title: t('metrics.owed'),
      value: formatByCurrency(totalOwedByCurrency, locale),
      sub: t('metrics.owedSub', { count: schoolsOwed }),
      icon: IconWalletOff,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: t('metrics.collected'),
      value: formatByCurrency(totalCollectedByCurrency, locale),
      sub: t('metrics.collectedSub'),
      icon: IconCoin,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: t('metrics.paidOut'),
      value: formatByCurrency(totalPaidOutByCurrency, locale),
      sub: t('metrics.paidOutSub'),
      icon: IconReportMoney,
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-payouts">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('description')}</p>
      </div>

      <div className="mb-8 grid gap-3 sm:grid-cols-3" data-testid="payouts-metrics">
        {metricCards.map((card) => (
          <Card key={card.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {card.title}
                  </p>
                  <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums" data-testid="metric-value">
                    {card.value}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground/70">{card.sub}</p>
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${card.bg}`}>
                  <card.icon className={`h-[18px] w-[18px] ${card.iconColor}`} strokeWidth={1.75} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasClawbacks && (
        <div
          className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
          data-testid="payouts-clawback-banner"
        >
          <span className="font-medium">
            {t('clawbackBanner.label', { total: formatByCurrency(totalClawbackByCurrency, locale) })}
          </span>{' '}
          {t('clawbackBanner.body')}
        </div>
      )}

      {hasOverpayments && (
        <div
          className="mb-6 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300"
          data-testid="payouts-overpaid-banner"
        >
          <span className="font-medium">
            {t('overpaidBanner.label', { total: formatByCurrency(totalOverpaidByCurrency, locale) })}
          </span>{' '}
          {t('overpaidBanner.body')}
          {/* Both banners can be describing the same money: a refund drops the
              sale out of `grossOwed`, which turns an already-recorded payout
              into an overpayment. Say so, rather than letting the two figures
              read as two separate problems. */}
          {hasClawbacks ? <> {t('overpaidBanner.refundOverlap')}</> : null}
        </div>
      )}

      <Card data-testid="payouts-by-tenant">
        <CardHeader>
          <CardTitle>{t('table.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('table.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">{t('table.headers.school')}</th>
                    <th className="pb-2 font-medium">{t('table.headers.currency')}</th>
                    <th className="pb-2 font-medium">{t('table.headers.providers')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.collected')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.schoolShare')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.paidSoFar')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.refunded')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.owed')}</th>
                    <th className="pb-2 text-right font-medium">{t('table.headers.overpaid')}</th>
                    <th className="pb-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.tenantId}-${r.currency}`} className="border-b last:border-0">
                      <td className="py-2.5 font-medium">{r.tenantName}</td>
                      <td className="py-2.5 uppercase text-muted-foreground">{r.currency}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {Object.keys(r.byProvider).length === 0
                          ? '—'
                          : Object.keys(r.byProvider).map((p) => PROVIDER_LABEL[p] ?? p).join(', ')}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">{formatMoney(r.grossCollected, r.currency, locale)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {r.schoolPercentage}%
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-muted-foreground">
                        {formatMoney(r.alreadyPaid, r.currency, locale)}
                      </td>
                      <ClawbackCell
                        amount={r.clawback}
                        formatted={formatMoney(r.clawback, r.currency, locale)}
                        hint={t('table.clawbackHint')}
                      />
                      <td className="py-2.5 text-right tabular-nums font-medium text-amber-600 dark:text-amber-400">
                        {formatMoney(r.netOwed, r.currency, locale)}
                      </td>
                      <OverpaidCell
                        amount={r.overpaid}
                        formatted={formatMoney(r.overpaid, r.currency, locale)}
                        hint={t('table.overpaidHint')}
                      />
                      <td className="py-2.5 text-right">
                        <MarkPayoutPaidDialog
                          tenantId={r.tenantId}
                          tenantName={r.tenantName}
                          netOwed={r.netOwed}
                          currency={r.currency}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-6 text-[11px] text-muted-foreground/70">{t('footnote')}</p>
    </main>
  )
}
