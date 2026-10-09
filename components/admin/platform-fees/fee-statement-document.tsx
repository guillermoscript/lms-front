import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconArrowLeft } from '@tabler/icons-react'
import type { FeeStatementView } from '@/lib/billing/platform-fee-statement'
import { formatMoney } from '@/lib/payments/format-money'
import { PrintStatementButton } from './refresh-buttons'
import { cn } from '@/lib/utils'

const STATUS_TONE: Record<string, string> = {
  paid: 'text-success',
  due: 'text-foreground',
  overdue: 'text-destructive',
}

/**
 * Hides the dashboard / platform chrome when printing, so the printout is the
 * statement alone. Scoped to pages that render this component.
 */
const PRINT_CSS = `@media print {
  [data-slot="sidebar"], [data-slot="sidebar-gap"], [data-slot="sidebar-container"], body header, nav[aria-label] { display: none !important; }
  [data-slot="sidebar-inset"] { margin: 0 !important; }
  [data-fee-statement] { border: 0 !important; box-shadow: none !important; }
}`

/**
 * A frozen, NON-FISCAL platform fee statement (#929, design 2.5). Renders the
 * row as it was closed (`lines`, `fee_amount`); only `status` is live. One
 * line per sale currency, never summed across currencies; converted
 * (hyperinflation) currencies show the USD base and the rate + source used.
 */
export async function FeeStatementDocument({
  statement,
  locale,
  backHref,
  backLabel,
}: {
  statement: FeeStatementView
  locale: string
  backHref: string
  /** Defaults to "Back to earnings". */
  backLabel?: string
}) {
  const t = await getTranslations('platformFees.statement')
  const tStatus = await getTranslations('platformFees.card.statements.status')
  const date = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
      new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso),
    )
  const money = (n: number, c: string) => formatMoney(n, c, locale)
  const rate = (n: number) => new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(n)

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6 print:max-w-none print:p-0" data-testid="fee-statement-page">
      <style>{PRINT_CSS}</style>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="size-4" aria-hidden="true" />
          {backLabel ?? t('back')}
        </Link>
        <PrintStatementButton label={t('print')} />
      </div>

      <article data-fee-statement className="space-y-6 rounded-xl border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground" data-testid="fee-statement-non-fiscal">
              {t('nonFiscal')}
            </p>
          </div>
          <p className="font-mono text-sm" data-testid="fee-statement-number">
            {statement.statementNumber}
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          {statement.tenantName && (
            <div className="flex justify-between gap-4 sm:block">
              <dt className="text-muted-foreground">{t('school')}</dt>
              <dd className="font-medium">{statement.tenantName}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">{t('period')}</dt>
            <dd>
              {date(statement.periodStart)} – {date(statement.periodEnd)}
            </dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">{t('issued')}</dt>
            <dd>{date(statement.issuedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">{t('due')}</dt>
            <dd>{date(statement.dueAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">{t('ledgerCurrency')}</dt>
            <dd>{statement.currency}</dd>
          </div>
          <div className="flex justify-between gap-4 sm:block">
            <dt className="text-muted-foreground">{t('status')}</dt>
            <dd className={cn('font-medium', STATUS_TONE[statement.status])} data-testid="fee-statement-status">
              {tStatus(statement.status)}
            </dd>
          </div>
        </dl>

        <section aria-labelledby="fee-statement-sales">
          <h2 id="fee-statement-sales" className="mb-2 text-sm font-medium">
            {t('salesTitle')}
          </h2>
          {statement.lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noLines')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="fee-statement-lines">
                <thead className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-4 font-medium">{t('headers.currency')}</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">{t('headers.count')}</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">{t('headers.sales')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('headers.fee')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statement.lines.map((l) => (
                    <tr key={l.currency} className="align-top" data-currency={l.currency}>
                      <td className="py-2 pr-4">
                        <span className="font-medium">{l.currency}</span>
                        {l.converted && (
                          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {l.usdSubtotal != null && <p>{t('convertedNote', { usd: money(l.usdSubtotal, 'USD') })}</p>}
                            {l.rates.map((r) => (
                              <p key={`${r.rate}-${r.source}`} className="tabular-nums" data-testid="fee-statement-rate">
                                {t('rate', { currency: l.currency, rate: rate(r.rate), source: r.source ?? t('unknownSource') })}
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{l.salesCount}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{money(l.salesTotal, l.currency)}</td>
                      <td className="py-2 text-right tabular-nums">{money(l.fee, statement.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <dl className="space-y-1.5 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4">
            <dt>
              {t('feeTotal')}{' '}
              <span className="text-xs text-muted-foreground">({t('txnCount', { count: statement.txnCount })})</span>
            </dt>
            <dd className="font-semibold tabular-nums" data-testid="fee-statement-total">
              {money(statement.feeAmount, statement.currency)}
            </dd>
          </div>
          {statement.priorAdjustment !== 0 && (
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>{t('priorAdjustment')}</dt>
              <dd className="tabular-nums">{money(statement.priorAdjustment, statement.currency)}</dd>
            </div>
          )}
          {statement.paymentsTotalAtClose != null && (
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>{t('paymentsAtClose')}</dt>
              <dd className="tabular-nums">{money(statement.paymentsTotalAtClose, statement.currency)}</dd>
            </div>
          )}
          {statement.closingBalance != null && (
            <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
              <dt>{t('closingBalance')}</dt>
              <dd className="tabular-nums" data-testid="fee-statement-closing">
                {money(statement.closingBalance, statement.currency)}
              </dd>
            </div>
          )}
        </dl>

        <footer className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <p>{t('utcNote')}</p>
          <p>{t('disclaimer')}</p>
        </footer>
      </article>
    </div>
  )
}
