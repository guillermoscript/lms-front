import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { IconAlertCircle, IconFileText, IconInfoCircle } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadSchoolFeeAccount, type SchoolFeeAccount } from '@/lib/billing/platform-fee-account'
import { owedBuckets } from '@/lib/billing/platform-fee-view'
import { formatMoney } from '@/lib/payments/format-money'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getPlatformFeeBankInstructions, feeTransferReference } from '@/lib/billing/platform-fee-bank-instructions'
import { FeePayNowDialog } from './fee-pay-now-dialog'
import { FeeRetryButton } from './refresh-buttons'
import { cn } from '@/lib/utils'

const STATE_TONE: Record<string, string> = {
  ok: 'bg-success/10 text-success border-success/30',
  reminded: 'bg-warning/10 text-warning border-warning/30',
  overdue: 'bg-destructive/10 text-destructive border-destructive/30',
  blocked: 'bg-destructive/10 text-destructive border-destructive/30',
}

const STATEMENT_TONE: Record<string, string> = {
  paid: 'text-success',
  due: 'text-muted-foreground',
  overdue: 'text-destructive',
}

/** Format a rate without rounding it to cents (e.g. 0.0273 USD per VES). */
function formatRate(rate: number, locale: string) {
  return new Intl.NumberFormat(locale, { maximumSignificantDigits: 6 }).format(rate)
}

/**
 * Platform fee balance card on the earnings page (#929, design 4.4). Server
 * component; the caller has already verified the viewer is an active admin of
 * `tenantId`. Fails to an inline "could not load, retry" (never a wrong
 * figure). Per-currency lines are listed, never summed.
 */
export async function FeeBalanceCard({
  tenantId,
  locale,
  paymentReturned = false,
}: {
  tenantId: string
  locale: string
  paymentReturned?: boolean
}) {
  const t = await getTranslations('platformFees.card')

  let account: SchoolFeeAccount | null = null
  try {
    account = await loadSchoolFeeAccount(createAdminClient(), tenantId)
  } catch (err) {
    console.error('[platform-fees] balance card read failed:', err instanceof Error ? err.message : err)
  }

  const bankInstructions = getPlatformFeeBankInstructions()
  let tenantSlug = ''
  if (bankInstructions || account?.payNow.length) {
    try {
      const { data } = await createAdminClient().from('tenants').select('slug').eq('id', tenantId).single()
      tenantSlug = data?.slug ?? ''
    } catch {
      // The reference falls back to the request id alone.
    }
  }
  const tenantReference = tenantSlug ? feeTransferReference(tenantSlug) : null

  return (
    <Card id="platform-fees" className="scroll-mt-20" data-testid="fee-balance-card">
      <CardHeader className="gap-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle>{t('title')}</CardTitle>
            {account && (
              <Badge variant="outline" className={cn('text-[10px]', STATE_TONE[account.standing.state])} data-testid="fee-standing-state">
                {t(`state.${account.standing.state}`)}
              </Badge>
            )}
          </div>
          {account && account.payNow.length > 0 && <FeePayNowDialog buckets={account.payNow} bankInstructions={bankInstructions} tenantReference={tenantReference} />}
        </div>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {!account ? (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="alert" data-testid="fee-balance-error">
            <IconAlertCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="min-w-0 flex-1">{t('loadError')}</p>
            <FeeRetryButton label={t('retry')} />
          </div>
        ) : (
          <FeeBalanceBody account={account} locale={locale} paymentReturned={paymentReturned} />
        )}
      </CardContent>
    </Card>
  )
}

async function FeeBalanceBody({
  account,
  locale,
  paymentReturned,
}: {
  account: SchoolFeeAccount
  locale: string
  paymentReturned: boolean
}) {
  const t = await getTranslations('platformFees.card')
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
  const owed = owedBuckets(account.balances)
  const overpaid = account.balances.filter((b) => b.overpaid > 0)
  const hasDebt = owed.length > 0

  return (
    <>
      {paymentReturned && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm" role="status" data-testid="fee-payment-returned">
          {t('paymentReturned')}
        </p>
      )}

      <div>
        {hasDebt ? (
          <>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('owed')}</p>
            <ul className="mt-2 space-y-2" data-testid="fee-owed-lines">
              {owed.map((b) => (
                <li key={b.currency} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5" data-currency={b.currency}>
                  <span className="text-2xl font-bold tracking-tight tabular-nums">{formatMoney(b.netOwed, b.currency, locale)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('accruedPaid', {
                      accrued: formatMoney(b.accrued, b.currency, locale),
                      paid: formatMoney(b.paid, b.currency, locale),
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {owed.length > 1 && <p className="mt-1 text-[11px] text-muted-foreground">{t('owedHint')}</p>}
          </>
        ) : (
          <div data-testid="fee-nothing-owed">
            <p className="text-lg font-semibold">{t('nothingOwed')}</p>
            <p className="text-sm text-muted-foreground">{t('nothingOwedDesc')}</p>
          </div>
        )}
      </div>

      {overpaid.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="fee-overpaid">
          <p className="font-medium">
            {overpaid.map((b) => t('overpaid', { amount: formatMoney(b.overpaid, b.currency, locale) })).join(' · ')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('overpaidNote')}</p>
        </div>
      )}

      {(account.openRequest || account.underReview > 0 || account.standing.enforcementExempt || (hasDebt && account.enforcementMode !== 'enforce')) && (
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {account.openRequest && (
            <li className="flex gap-2" data-testid="fee-open-request">
              <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('openRequest', {
                amount: formatMoney(account.openRequest.amount, account.openRequest.currency, locale),
                date: fmtDate(account.openRequest.createdAt),
              })}
            </li>
          )}
          {account.underReview > 0 && (
            <li className="flex gap-2" data-testid="fee-under-review">
              <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('underReview', { count: account.underReview })}
            </li>
          )}
          {account.standing.enforcementExempt && (
            <li className="flex gap-2">
              <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('exempt')}
            </li>
          )}
          {hasDebt && account.enforcementMode !== 'enforce' && !account.standing.enforcementExempt && (
            <li className="flex gap-2">
              <IconInfoCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('notifyOnly')}
            </li>
          )}
        </ul>
      )}

      {account.converted.length > 0 && (
        <details className="group rounded-lg border p-3 text-sm" data-testid="fee-converted">
          <summary className="cursor-pointer font-medium">{t('converted.title')}</summary>
          <ul className="mt-2 space-y-2">
            {account.converted.map((c) => (
              <li key={c.currency}>
                <p className="tabular-nums">
                  {t('converted.line', {
                    count: c.count,
                    currency: c.currency,
                    sales: formatMoney(c.salesTotal, c.currency, locale),
                    usd: formatMoney(c.usdTotal, 'USD', locale),
                  })}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {c.rates.map((r) => (
                    <li key={`${r.rate}-${r.source}`} className="tabular-nums" data-testid="fee-converted-rate">
                      {t('converted.rate', {
                        currency: c.currency,
                        rate: formatRate(r.rate, locale),
                        source: r.source ?? t('converted.unknownSource'),
                        date: fmtDate(r.date),
                      })}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{t('converted.note')}</p>
        </details>
      )}

      <section aria-labelledby="fee-statements-title">
        <h3 id="fee-statements-title" className="text-sm font-medium">
          {t('statements.title')}
        </h3>
        {account.statements.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">{t('statements.empty')}</p>
        ) : (
          <ul className="mt-2 divide-y rounded-lg border text-sm" data-testid="fee-statements">
            {account.statements.map((s) => (
              <li key={s.statementNumber} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <Link
                  href={`/${locale}/dashboard/admin/earnings/statements/${s.statementNumber}`}
                  className="inline-flex items-center gap-1.5 font-mono text-xs hover:underline underline-offset-4"
                  aria-label={t('statements.view', { number: s.statementNumber })}
                >
                  <IconFileText className="size-4" aria-hidden="true" />
                  {s.statementNumber}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {t('statements.period', { start: fmtDate(`${s.periodStart}T00:00:00Z`), end: fmtDate(`${s.periodEnd}T00:00:00Z`) })}
                </span>
                <span className="tabular-nums">{formatMoney(s.feeAmount, s.currency, locale)}</span>
                <span className="text-xs text-muted-foreground">{t('statements.due', { date: fmtDate(s.dueAt) })}</span>
                <span className={cn('text-xs font-medium', STATEMENT_TONE[s.status])}>{t(`statements.status.${s.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{t('timezone')}</p>
      </section>
    </>
  )
}
