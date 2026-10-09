import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantFeeOverview, type TenantFeeOverview } from '@/lib/billing/platform-fee-admin'
import { listFeeStatements } from '@/lib/billing/platform-fee-statement'
import { formatMoney } from '@/lib/payments/format-money'
import { PlatformPanel, PlatformSection, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { StatusDot } from '@/components/platform/badges'
import { cn } from '@/lib/utils'
import {
  ConfirmFeeRequestButton,
  FeeExemptionButton,
  RecordFeePaymentDialog,
  ReverseFeePaymentButton,
} from './fee-ledger-actions'

const STATE_TONE = { ok: 'ok', reminded: 'warn', overdue: 'bad', blocked: 'bad' } as const
const PAYMENT_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  succeeded: 'ok',
  pending: 'warn',
  failed: 'bad',
  canceled: 'muted',
  reversed: 'bad',
}

/**
 * Super-admin platform fee panel on /platform/tenants/[tenantId] (#929,
 * step 7): standing, per-currency balances (never summed), open transfer
 * requests to confirm, payments (reversible), statements and the audit trail.
 * Every write goes through `app/actions/platform/platform-fees.ts`
 * (super-admin verified, one audited SECURITY DEFINER call each).
 * The page is already behind the /platform super-admin guard.
 */
export async function TenantFeePanel({ tenantId, locale }: { tenantId: string; locale: string }) {
  const t = await getTranslations('platform.fees')
  const admin = createAdminClient()

  let overview: TenantFeeOverview
  let statements: Awaited<ReturnType<typeof listFeeStatements>>
  try {
    ;[overview, statements] = await Promise.all([getTenantFeeOverview(admin, tenantId), listFeeStatements(admin, tenantId, 12)])
  } catch (err) {
    console.error('[platform-fees] tenant panel read failed:', err instanceof Error ? err.message : err)
    return (
      <PlatformSection title={t('title')} className="lg:col-span-2" data-testid="tenant-fee-panel">
        <PlatformPanel className="px-5 py-4 text-sm text-destructive">{t('errors.internal')}</PlatformPanel>
      </PlatformSection>
    )
  }

  const fmt = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(iso)) + ' UTC' : t('never')
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso))
  const { standing } = overview
  const currencies = Array.from(new Set(['USD', ...overview.balances.map((b) => b.currency)]))

  return (
    <PlatformSection
      title={t('title')}
      description={t('description')}
      className="lg:col-span-2"
      data-testid="tenant-fee-panel"
      action={
        <div className="flex flex-wrap gap-2">
          <RecordFeePaymentDialog tenantId={tenantId} currencies={currencies} />
          <FeeExemptionButton tenantId={tenantId} exempt={standing.enforcementExempt} />
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <PlatformPanel className="px-5 py-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm" data-testid="tenant-fee-standing">
            <dt className="text-muted-foreground">{t('standing')}</dt>
            <dd>
              <StatusDot tone={STATE_TONE[standing.state]} label={t(`state.${standing.state}`)} className="normal-case" />
            </dd>
            {standing.overdueSince && (
              <>
                <dt className="text-muted-foreground">{t('overdueSince')}</dt>
                <dd>{fmt(standing.overdueSince)}</dd>
              </>
            )}
            {standing.blockedAt && (
              <>
                <dt className="text-muted-foreground">{t('blockedAt')}</dt>
                <dd className="text-red-700 dark:text-red-400">{fmt(standing.blockedAt)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">{t('exempt')}</dt>
            <dd>{standing.enforcementExempt ? t('exemptYes', { reason: standing.exemptReason ?? '—' }) : t('exemptNo')}</dd>
            <dt className="text-muted-foreground">{t('lastEvaluated')}</dt>
            <dd>{fmt(standing.lastEvaluatedAt)}</dd>
          </dl>
        </PlatformPanel>

        <PlatformPanel>
          {overview.balances.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted-foreground">{t('noBalances')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="tenant-fee-balances">
                <caption className="sr-only">{t('balances')}</caption>
                <thead className="border-b border-border">
                  <tr>
                    <th className={TH}>{t('balanceHeaders.currency')}</th>
                    <th className={TH_RIGHT}>{t('balanceHeaders.accrued')}</th>
                    <th className={TH_RIGHT}>{t('balanceHeaders.paid')}</th>
                    <th className={TH_RIGHT}>{t('balanceHeaders.owed')}</th>
                    <th className={TH_RIGHT}>{t('balanceHeaders.overpaid')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.balances.map((b) => (
                    <tr key={b.currency} data-currency={b.currency}>
                      <td className={cn(TD, 'font-medium')}>{b.currency}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{formatMoney(b.accrued, b.currency, locale)}</td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{formatMoney(b.paid, b.currency, locale)}</td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>{formatMoney(b.netOwed, b.currency, locale)}</td>
                      <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>
                        {b.overpaid > 0 ? formatMoney(b.overpaid, b.currency, locale) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PlatformPanel>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold">{t('openRequests')}</h3>
          <PlatformPanel>
            {overview.openRequests.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('noOpenRequests')}</p>
            ) : (
              <ul className="divide-y divide-border text-sm" data-testid="tenant-fee-open-requests">
                {overview.openRequests.map((r) => {
                  const amount = formatMoney(r.amount, r.currency, locale)
                  return (
                    <li key={r.requestId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <span>
                        <span className="font-medium tabular-nums">{amount}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {r.status.replace(/_/g, ' ')} · {day(r.createdAt)}
                        </span>
                      </span>
                      <ConfirmFeeRequestButton requestId={r.requestId} amountLabel={amount} />
                    </li>
                  )
                })}
              </ul>
            )}
          </PlatformPanel>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold">{t('statements')}</h3>
          <PlatformPanel>
            {statements.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('noStatements')}</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {statements.map((s) => (
                  <li key={s.statementNumber} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                    <span className="font-mono text-xs">{s.statementNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {day(`${s.periodStart}T00:00:00Z`)} – {day(`${s.periodEnd}T00:00:00Z`)}
                    </span>
                    <span className="tabular-nums">{formatMoney(s.feeAmount, s.currency, locale)}</span>
                    <Link
                      href={`/${locale}/platform/tenants/${tenantId}/statements/${s.statementNumber}`}
                      className="text-xs text-primary hover:underline underline-offset-4"
                    >
                      {t('viewStatement')}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </PlatformPanel>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-xs font-semibold">{t('payments')}</h3>
          <PlatformPanel>
            {overview.payments.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('noPayments')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="tenant-fee-payments">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={TH}>{t('paymentHeaders.date')}</th>
                      <th className={TH}>{t('paymentHeaders.provider')}</th>
                      <th className={TH}>{t('paymentHeaders.status')}</th>
                      <th className={TH_RIGHT}>{t('paymentHeaders.amount')}</th>
                      <th className={TH}>{t('paymentHeaders.note')}</th>
                      <th className={TH_RIGHT}>
                        <span className="sr-only">{t('reverse.trigger')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overview.payments.map((p) => {
                      const amount = formatMoney(p.amount, p.currency, locale)
                      const note = p.reversalReason ?? p.reviewReason ?? p.notes
                      return (
                        <tr key={p.paymentId}>
                          <td className={cn(TD, 'text-xs tabular-nums text-muted-foreground')}>{day(p.paidAt ?? p.createdAt)}</td>
                          <td className={cn(TD, 'capitalize text-muted-foreground')}>{p.provider}</td>
                          <td className={TD}>
                            <StatusDot tone={PAYMENT_TONE[p.status] ?? 'muted'} label={p.status} />
                          </td>
                          <td className={cn(TD, 'text-right font-medium tabular-nums')}>{amount}</td>
                          <td className={cn(TD, 'max-w-[18rem] text-xs text-muted-foreground')}>{note ?? '—'}</td>
                          <td className={cn(TD, 'text-right')}>
                            {p.status === 'succeeded' && <ReverseFeePaymentButton paymentId={p.paymentId} amountLabel={amount} />}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PlatformPanel>
        </div>

        <div className="space-y-2 lg:col-span-2">
          <h3 className="text-xs font-semibold">{t('audit')}</h3>
          <PlatformPanel>
            {overview.audit.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">{t('noAudit')}</p>
            ) : (
              <ul className="divide-y divide-border text-sm" data-testid="tenant-fee-audit">
                {overview.audit.map((a, i) => (
                  <li key={`${a.createdAt}-${i}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5">
                    <span className="font-medium">
                      {t.has(`auditActions.${a.action}`) ? t(`auditActions.${a.action}`) : a.action}
                    </span>
                    {a.amount != null && a.currency && (
                      <span className="tabular-nums">{formatMoney(a.amount, a.currency, locale)}</span>
                    )}
                    {a.reason && <span className="min-w-0 text-xs text-muted-foreground">{a.reason}</span>}
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {fmt(a.createdAt)}
                      {!a.actorId && ` · ${t('automated')}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PlatformPanel>
        </div>
      </div>
    </PlatformSection>
  )
}
