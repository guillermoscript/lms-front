import Link from 'next/link'
import {
  getAtRiskTenants,
  getPlanConfigurationHealth,
} from '@/app/actions/platform/billing-health'
import type { AtRiskReason } from '@/lib/billing/billing-health'
import { platformCheckoutReasonLabel, providerLabel } from '@/lib/billing/plan-prices'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import {
  IconAlertTriangle,
  IconClockPause,
  IconCreditCardOff,
  IconLockExclamation,
} from '@tabler/icons-react'

const REASON_LABELS: Record<AtRiskReason, string> = {
  tenant_past_due: 'Past due',
  subscription_past_due: 'Subscription past due',
  access_cutoff_scheduled: 'Cutoff scheduled',
}

function reasonLabel(reason: AtRiskReason, cutoffActive: boolean): string {
  // A cutoff date in the past means access is already paused, not pending.
  if (reason === 'access_cutoff_scheduled' && cutoffActive) return 'Access paused'
  return REASON_LABELS[reason]
}

export default async function PlatformBillingHealthPage() {
  const [atRisk, planHealth] = await Promise.all([
    getAtRiskTenants(),
    getPlanConfigurationHealth(),
  ])

  // The metric cards deliberately keep counting past-due tenants only, so the
  // numbers do not silently change meaning now that #514 also lists tenants
  // that are merely over their plan limits. Cutoffs get their own card.
  // Counted in one pass — five chained .filter() calls over the same list was
  // five allocations for four numbers.
  const counts = { pastDue: 0, manualTransfer: 0, stripeDunning: 0, cutoffScheduled: 0, urgent: 0 }
  for (const t of atRisk) {
    const isPastDue =
      t.reasons.includes('tenant_past_due') || t.reasons.includes('subscription_past_due')
    if (isPastDue) {
      counts.pastDue++
      if (t.paymentProvider === 'manual') {
        counts.manualTransfer++
        if (t.daysUntilDowngrade !== null && t.daysUntilDowngrade <= 3) counts.urgent++
      } else {
        counts.stripeDunning++
      }
    }
    if (t.reasons.includes('access_cutoff_scheduled')) counts.cutoffScheduled++
  }

  const metricCards = [
    {
      title: 'Past-Due Schools',
      value: String(counts.pastDue),
      sub: 'Total schools currently behind on payment',
      icon: IconAlertTriangle,
      bg: 'bg-red-50 dark:bg-red-950/40',
      iconColor: 'text-red-600 dark:text-red-400',
    },
    {
      title: 'Manual-Transfer Grace Running',
      value: String(counts.manualTransfer),
      sub:
        counts.urgent > 0
          ? `${counts.urgent} downgrading within 3 days`
          : 'None expiring imminently',
      icon: IconClockPause,
      bg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
    },
    {
      title: 'Stripe Dunning In Progress',
      value: String(counts.stripeDunning),
      sub: 'Downgrade timing controlled by Stripe, not this app',
      icon: IconCreditCardOff,
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      title: 'Access Cutoff Scheduled',
      value: String(counts.cutoffScheduled),
      sub: 'Over plan limits — access pauses on the cutoff date',
      icon: IconLockExclamation,
      bg: 'bg-purple-50 dark:bg-purple-950/40',
      iconColor: 'text-purple-600 dark:text-purple-400',
    },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-billing-health">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Billing Health</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Schools that are past-due or over their plan limits, with their countdown to automatic
          downgrade or access cutoff.
        </p>
      </div>

      {/*
        Plan configuration (#602). Its own section, not a row in the at-risk
        table: a plan with no price belongs to no tenant and breaks checkout for
        every school at once, so it outranks any individual school's countdown.
      */}
      <Card className="mb-8" data-testid="plan-configuration-health">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Plan configuration
            {planHealth.unpurchasable.length === 0 &&
            planHealth.partiallyPriced.length === 0 ? (
              <Badge variant="secondary" className="text-[10px]" data-testid="plan-config-status" data-status="ok">
                All plans purchasable
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]" data-testid="plan-config-status" data-status="broken">
                {planHealth.unpurchasable.length + planHealth.partiallyPriced.length} needing attention
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {planHealth.unpurchasable.length === 0 && planHealth.partiallyPriced.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every active paid plan has at least one executable automated checkout method.
              Manual transfer is tracked separately as an offline fallback.
            </p>
          ) : (
            <>
              {planHealth.unpurchasable.length > 0 && (
                <div
                  className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/40"
                  data-testid="unpurchasable-plans"
                >
                  <p className="text-sm font-medium text-red-800 dark:text-red-300">
                    Not purchasable — no executable automated provider
                  </p>
                  <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-400/80">
                    These plans are advertised with a price, but every configured automated
                    provider is blocked. Manual transfer remains available separately.
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {planHealth.unpurchasable.map((plan) => (
                      <li
                        key={plan.planId}
                        className="flex items-center gap-2"
                        data-testid="unpurchasable-plan-row"
                        data-plan-slug={plan.slug}
                      >
                        <span className="min-w-0 font-medium text-red-800 dark:text-red-300">{plan.name}</span>
                        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">{plan.slug}</Badge>
                        <span className="min-w-0 break-words text-xs text-red-700/80 dark:text-red-400/80">
                          {plan.providerDiagnostics.length > 0
                            ? plan.providerDiagnostics
                                .flatMap((diagnostic) =>
                                  diagnostic.unavailable.map(
                                    ({ interval, reason }) =>
                                      `${providerLabel(diagnostic.provider)} ${interval}: ${platformCheckoutReasonLabel(reason)}`,
                                  ),
                                )
                                .join(' · ')
                            : 'No provider price configured'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {planHealth.partiallyPriced.length > 0 && (
                <div
                  className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/40"
                  data-testid="partially-priced-plans"
                >
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                    Priced on some intervals only
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {planHealth.partiallyPriced.map((plan) => (
                      <li
                        key={plan.planId}
                        data-testid="partially-priced-plan-row"
                        data-plan-slug={plan.slug}
                      >
                        <span className="font-medium text-amber-800 dark:text-amber-300">{plan.name}</span>{' '}
                        <span className="text-amber-700/80 dark:text-amber-400/80">
                          — no executable checkout for {plan.missingIntervals.join(' or ')}; ready via{' '}
                          {plan.automatedProviders.map((p) => providerLabel(p.provider)).join(', ')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-sm">
                <Link href="/platform/plans" className="text-primary underline underline-offset-4">
                  Configure provider prices on /platform/plans
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="billing-health-metrics">
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
                  <card.icon className={`h-[18px] w-[18px] ${card.iconColor}`} strokeWidth={1.75} aria-hidden="true" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card data-testid="billing-health-by-tenant">
        <CardHeader>
          <CardTitle>At-risk schools</CardTitle>
        </CardHeader>
        <CardContent>
          {atRisk.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No schools are past-due or over their plan limits.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-2 font-medium">School</th>
                    <th className="pb-2 font-medium">Plan</th>
                    <th className="pb-2 font-medium">Reason</th>
                    <th className="pb-2 font-medium">Payment method</th>
                    <th className="pb-2 font-medium">Past due since</th>
                    <th className="pb-2 font-medium">Downgrades in</th>
                    <th className="pb-2 font-medium">Access cutoff</th>
                  </tr>
                </thead>
                <tbody>
                  {atRisk.map((t) => (
                    <tr key={t.tenantId} className="border-b last:border-0" data-testid="at-risk-row" data-tenant-id={t.tenantId}>
                      <td className="py-2.5 font-medium">{t.tenantName}</td>
                      <td className="py-2.5 capitalize text-muted-foreground">{t.plan || '—'}</td>
                      <td className="py-2.5" data-testid="at-risk-reasons" data-reasons={t.reasons.join(' ')}>
                        <div className="flex flex-wrap gap-1">
                          {t.reasons.map((reason) => (
                            <Badge key={reason} variant="secondary" className="text-[10px] font-normal">
                              {reasonLabel(reason, t.accessCutoffActive)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.paymentProvider ? providerLabel(t.paymentProvider) : '—'}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.pastDueSince ? format(new Date(t.pastDueSince), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="py-2.5">
                        {t.isEstimate ? (
                          <Badge variant="outline" className="text-[10px]">Stripe-managed</Badge>
                        ) : t.daysUntilDowngrade !== null ? (
                          <span
                            className={`font-medium tabular-nums ${
                              t.daysUntilDowngrade <= 3
                                ? 'text-red-600 dark:text-red-400'
                                : t.daysUntilDowngrade <= 7
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-muted-foreground'
                            }`}
                          >
                            {t.daysUntilDowngrade <= 0 ? 'Overdue' : `${t.daysUntilDowngrade} day${t.daysUntilDowngrade === 1 ? '' : 's'}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {t.accessCutoffAt ? format(new Date(t.accessCutoffAt), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
