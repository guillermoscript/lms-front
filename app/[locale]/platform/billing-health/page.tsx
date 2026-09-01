import Link from 'next/link'
import { format } from 'date-fns'
import { IconCircleCheck } from '@tabler/icons-react'
import {
  getAtRiskTenants,
  getLastPlanLimitSweep,
  getPlanConfigurationHealth,
} from '@/app/actions/platform/billing-health'
import type { AtRiskReason } from '@/lib/billing/billing-health'
import { platformCheckoutReasonLabel, providerLabel } from '@/lib/billing/plan-prices'
import { Badge } from '@/components/ui/badge'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { StatStrip, type StatItem } from '@/components/platform/stat-strip'
import { PlatformPanel, PlatformSection, TD, TH } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { cn } from '@/lib/utils'

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
  const [atRisk, planHealth, sweep] = await Promise.all([
    getAtRiskTenants(),
    getPlanConfigurationHealth(),
    getLastPlanLimitSweep(),
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

  const metrics: StatItem[] = [
    {
      label: 'Past due',
      value: counts.pastDue,
      detail: 'Schools currently behind on payment',
      tone: counts.pastDue > 0 ? 'danger' : 'default',
    },
    {
      label: 'Manual-transfer grace running',
      value: counts.manualTransfer,
      detail:
        counts.urgent > 0
          ? `${counts.urgent} downgrading within 3 days`
          : 'None expiring imminently',
      tone: counts.urgent > 0 ? 'danger' : counts.manualTransfer > 0 ? 'warning' : 'default',
    },
    {
      label: 'Stripe dunning',
      value: counts.stripeDunning,
      detail: 'Downgrade timing controlled by Stripe, not this app',
      tone: counts.stripeDunning > 0 ? 'warning' : 'default',
    },
    {
      label: 'Access cutoffs scheduled',
      value: counts.cutoffScheduled,
      detail: 'Over plan limits — access pauses on the cutoff date',
      tone: counts.cutoffScheduled > 0 ? 'warning' : 'default',
    },
  ]

  const planProblems = planHealth.unpurchasable.length + planHealth.partiallyPriced.length

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-billing-health">
      <PlatformPageHeader
        title="Billing health"
        description="Schools that are past due or over their plan limits, with the countdown to automatic downgrade or access cutoff — and whether the plans themselves can be bought."
      />

      {/*
        Plan configuration (#602). Its own section, not a row in the at-risk
        table: a plan with no price belongs to no tenant and breaks checkout for
        every school at once, so it outranks any individual school's countdown.
      */}
      <PlatformSection
        title="Plan configuration"
        action={
          planProblems === 0 ? (
            <Badge variant="secondary" data-testid="plan-config-status" data-status="ok">
              All plans purchasable
            </Badge>
          ) : (
            <Badge variant="destructive" data-testid="plan-config-status" data-status="broken">
              {planProblems} needing attention
            </Badge>
          )
        }
        className="mb-8"
        data-testid="plan-configuration-health"
      >
        {planProblems === 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-5 py-4 text-sm">
            <IconCircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <p className="text-muted-foreground">
              Every active paid plan has at least one executable automated checkout method.
              Manual transfer is tracked separately as an offline fallback.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
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
                      <Badge variant="outline" className="shrink-0 font-mono">{plan.slug}</Badge>
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
          </div>
        )}
      </PlatformSection>

      {/*
        Enforcement liveness (#660). Every countdown below assumes the nightly
        sweep runs; this is the ledger that proves it did. pg_cron writes a
        `cron_runs` row per invocation, so "never" here means no scheduler has
        reached the route from the database yet.
      */}
      <PlatformSection
        title="Plan-limit sweep"
        description="Last nightly enforce-plan-limits run from the pg_cron scheduler. Reminders, cutoffs and clearances only happen when this runs."
        data-testid="billing-health-sweep"
        className="mb-8"
      >
        <PlatformPanel>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-sm" data-state={sweep.state}>
            <Badge
              variant={sweep.state === 'ok' ? 'secondary' : sweep.state === 'running' ? 'outline' : 'destructive'}
              data-testid="billing-health-sweep-state"
            >
              {sweep.state === 'ok' && 'Healthy'}
              {sweep.state === 'running' && 'Running'}
              {sweep.state === 'failed' && 'Failed'}
              {sweep.state === 'unconfigured' && 'Not configured'}
              {sweep.state === 'never' && 'Never run'}
            </Badge>
            {sweep.requestedAt ? (
              <span className="text-muted-foreground">
                Last run {format(new Date(sweep.requestedAt), 'PPp')}
                {sweep.statusCode !== null && ` · HTTP ${sweep.statusCode}`}
              </span>
            ) : (
              <span className="text-muted-foreground">
                No pg_cron invocation recorded. Create the <code>cron_secret</code> and{' '}
                <code>cron_base_url</code> Vault secrets (docs/CRON_RUNBOOK.md §1).
              </span>
            )}
            {sweep.summary && (
              <span className="text-muted-foreground">
                {String(sweep.summary.none ?? 0)} unchanged · {String(sweep.summary.scheduled ?? 0)} cutoffs scheduled ·{' '}
                {String(sweep.summary.cleared ?? 0)} cleared · {String(sweep.summary.errors ?? 0)} errors ·{' '}
                {String(sweep.summary.notifyFailures ?? 0)} notify failures
              </span>
            )}
            {sweep.error && (
              <span className="text-destructive" data-testid="billing-health-sweep-error">
                {sweep.error}
              </span>
            )}
          </div>
        </PlatformPanel>
      </PlatformSection>

      <StatStrip stats={metrics} className="mb-8" data-testid="billing-health-metrics" />

      <PlatformSection
        title="At-risk schools"
        description="Red countdowns downgrade within 3 days; amber within a week."
        data-testid="billing-health-by-tenant"
      >
        <PlatformPanel>
          {atRisk.length === 0 ? (
            <PlatformEmptyState
              icon={IconCircleCheck}
              title="No schools at risk"
              description="Nobody is past due or over their plan limits."
              className="py-8"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className={TH}>School</th>
                    <th className={TH}>Plan</th>
                    <th className={TH}>Reason</th>
                    <th className={TH}>Payment method</th>
                    <th className={TH}>Past due since</th>
                    <th className={TH}>Downgrades in</th>
                    <th className={TH}>Access cutoff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {atRisk.map((t) => (
                    <tr key={t.tenantId} data-testid="at-risk-row" data-tenant-id={t.tenantId}>
                      <td className={cn(TD, 'font-medium')}>
                        <Link
                          href={`/platform/tenants/${t.tenantId}`}
                          className="hover:text-primary hover:underline underline-offset-4"
                        >
                          {t.tenantName}
                        </Link>
                      </td>
                      <td className={cn(TD, 'capitalize text-muted-foreground')}>{t.plan || '—'}</td>
                      <td className={TD} data-testid="at-risk-reasons" data-reasons={t.reasons.join(' ')}>
                        <div className="flex flex-wrap gap-1">
                          {t.reasons.map((reason) => (
                            <Badge key={reason} variant="secondary" className="font-normal">
                              {reasonLabel(reason, t.accessCutoffActive)}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className={cn(TD, 'text-muted-foreground')}>
                        {t.paymentProvider ? providerLabel(t.paymentProvider) : '—'}
                      </td>
                      <td className={cn(TD, 'text-muted-foreground tabular-nums')}>
                        {t.pastDueSince ? format(new Date(t.pastDueSince), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className={TD}>
                        {t.isEstimate ? (
                          <Badge variant="outline">Stripe-managed</Badge>
                        ) : t.daysUntilDowngrade !== null ? (
                          <span
                            className={cn(
                              'font-medium tabular-nums',
                              t.daysUntilDowngrade <= 3
                                ? 'text-red-700 dark:text-red-400'
                                : t.daysUntilDowngrade <= 7
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {t.daysUntilDowngrade <= 0 ? 'Overdue' : `${t.daysUntilDowngrade} day${t.daysUntilDowngrade === 1 ? '' : 's'}`}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-muted-foreground tabular-nums')}>
                        {t.accessCutoffAt ? format(new Date(t.accessCutoffAt), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </PlatformPanel>
      </PlatformSection>
    </main>
  )
}
