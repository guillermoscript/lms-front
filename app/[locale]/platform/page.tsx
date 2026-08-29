import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  IconArrowRight,
  IconBuildingStore,
  IconCircleCheck,
  IconClockPause,
  IconExternalLink,
  IconLockExclamation,
  IconReceipt,
  IconSchool,
} from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAtRiskTenants, getPlanConfigurationHealth } from '@/app/actions/platform/billing-health'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { StatStrip, type StatItem } from '@/components/platform/stat-strip'
import { PlatformPanel, PlatformSection, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { RelativeTime } from '@/components/platform/relative-time'
import { PlanBadge, StatusDot, tenantStatusTone } from '@/components/platform/badges'
import { cn } from '@/lib/utils'

interface PlatformStats {
  total_tenants: number
  new_tenants_30d: number
  tenants_by_plan: Record<string, number>
  pending_payment_requests: number
  mrr_cents: number
  total_students: number
}

const PLAN_ORDER = ['free', 'starter', 'pro', 'business', 'enterprise']
const OPEN_REQUEST_STATUSES = ['pending', 'instructions_sent', 'payment_received']

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n ?? 0)

// PostgREST types a to-one embed as an array when it can't see the FK cardinality.
const embedded = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

interface AttentionItem {
  key: string
  tone: 'warning' | 'danger'
  icon: typeof IconReceipt
  count: number
  title: string
  description: string
  href: string
  cta: string
  rows?: ReactNode
}

export default async function PlatformOverviewPage() {
  const adminClient = createAdminClient()

  const [
    { data: statsRaw },
    atRisk,
    planHealth,
    { data: openRequests, count: openRequestCount },
    { data: recentTenants },
  ] = await Promise.all([
    adminClient.rpc('get_platform_stats'),
    getAtRiskTenants(),
    getPlanConfigurationHealth(),
    adminClient
      .from('platform_payment_requests')
      .select('request_id, amount, currency, interval, status, created_at, tenants(name), platform_plans(name)', {
        count: 'exact',
      })
      .in('status', OPEN_REQUEST_STATUSES)
      .order('created_at', { ascending: true })
      .limit(3),
    adminClient
      .from('tenants')
      .select('id, name, slug, plan, status, created_at')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const stats = (statsRaw || {}) as PlatformStats
  // `mrr_cents` is a misnomer — the RPC returns normalised monthly dollars.
  const mrr = stats.mrr_cents ?? 0
  const totalTenants = stats.total_tenants ?? 0
  const planDistribution = stats.tenants_by_plan ?? {}

  const recentIds = (recentTenants || []).map((t) => t.id)
  const { data: recentStudents } = recentIds.length
    ? await adminClient
        .from('tenant_users')
        .select('tenant_id')
        .in('tenant_id', recentIds)
        .eq('role', 'student')
        .eq('status', 'active')
    : { data: [] as { tenant_id: string }[] }
  const studentCounts = (recentStudents || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.tenant_id] = (acc[r.tenant_id] || 0) + 1
    return acc
  }, {})
  const recentRows = await Promise.all(
    (recentTenants || []).map(async (t) => ({
      ...t,
      students: studentCounts[t.id] || 0,
      siteUrl: await getTenantSiteUrl(t.slug),
    })),
  )

  // ── Needs attention ──────────────────────────────────────────────────────
  const pastDue = atRisk.filter(
    (t) => t.reasons.includes('tenant_past_due') || t.reasons.includes('subscription_past_due'),
  )
  const cutoffs = atRisk.filter((t) => t.reasons.includes('access_cutoff_scheduled'))
  const brokenPlans = planHealth.unpurchasable.length + planHealth.partiallyPriced.length
  const pendingCount = openRequestCount ?? 0

  const attention: AttentionItem[] = []
  if (pendingCount > 0) {
    attention.push({
      key: 'pending-payments',
      tone: 'warning',
      icon: IconReceipt,
      count: pendingCount,
      title: pendingCount === 1 ? 'manual payment awaiting review' : 'manual payments awaiting review',
      description: 'A school stays on its old plan until you confirm the transfer.',
      href: '/platform/billing',
      cta: 'Review requests',
      rows: (
        <ul className="divide-y divide-border/60 text-xs">
          {(openRequests || []).map((r) => (
            <li key={r.request_id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium">
                {embedded(r.tenants)?.name ?? 'Unknown school'}
              </span>
              <span className="text-muted-foreground capitalize">
                {embedded(r.platform_plans)?.name ?? '—'} · {r.interval}
              </span>
              <span className="tabular-nums">{money(r.amount, r.currency)}</span>
              <RelativeTime value={r.created_at} className="w-20 text-right text-muted-foreground tabular-nums" />
            </li>
          ))}
          {pendingCount > (openRequests?.length ?? 0) && (
            <li className="py-2 text-muted-foreground">
              +{pendingCount - (openRequests?.length ?? 0)} more
            </li>
          )}
        </ul>
      ),
    })
  }
  if (pastDue.length > 0) {
    const urgent = pastDue.filter((t) => t.daysUntilDowngrade !== null && t.daysUntilDowngrade <= 3).length
    attention.push({
      key: 'past-due',
      tone: 'danger',
      icon: IconClockPause,
      count: pastDue.length,
      title: pastDue.length === 1 ? 'school past due' : 'schools past due',
      description:
        urgent > 0
          ? `${urgent} downgrade${urgent === 1 ? 's' : ''} to free within 3 days unless payment lands.`
          : 'Grace periods are running — each downgrades to free when its grace ends.',
      href: '/platform/billing-health',
      cta: 'See countdowns',
    })
  }
  if (cutoffs.length > 0) {
    attention.push({
      key: 'cutoffs',
      tone: 'warning',
      icon: IconLockExclamation,
      count: cutoffs.length,
      title: cutoffs.length === 1 ? 'access cutoff scheduled' : 'access cutoffs scheduled',
      description: 'Over plan limits. Student access pauses on the cutoff date.',
      href: '/platform/billing-health',
      cta: 'See dates',
    })
  }
  if (brokenPlans > 0) {
    attention.push({
      key: 'plans',
      tone: 'danger',
      icon: IconBuildingStore,
      count: brokenPlans,
      title: brokenPlans === 1 ? 'plan cannot be purchased' : 'plans cannot be purchased',
      description: 'Advertised on the pricing page, but checkout has no working provider price.',
      href: '/platform/plans',
      cta: 'Fix prices',
    })
  }

  // ── Numbers ───────────────────────────────────────────────────────────────
  const metrics: StatItem[] = [
    {
      label: 'Monthly recurring revenue',
      value: usd(mrr),
      detail: 'Active school subscriptions, normalised to monthly',
      href: '/platform/revenue',
      testId: 'metric-monthly-recurring-revenue',
    },
    {
      label: 'Active schools',
      value: totalTenants,
      detail:
        (stats.new_tenants_30d ?? 0) > 0
          ? `+${stats.new_tenants_30d} in the last 30 days`
          : 'No new schools in the last 30 days',
      href: '/platform/tenants',
      testId: 'metric-active-tenants',
    },
    {
      label: 'Students',
      value: (stats.total_students ?? 0).toLocaleString('en-US'),
      detail: 'Distinct student accounts, all schools',
      href: '/platform/tenants',
      testId: 'metric-total-students',
    },
    {
      label: 'Pending payments',
      value: pendingCount,
      detail: pendingCount > 0 ? 'Manual transfers to confirm' : 'Nothing to confirm',
      href: '/platform/billing',
      tone: pendingCount > 0 ? 'warning' : 'default',
      testId: 'metric-pending-payments',
    },
  ]

  const planRows = [
    ...PLAN_ORDER.filter((p) => planDistribution[p]).map((p) => [p, planDistribution[p]] as const),
    ...Object.entries(planDistribution).filter(([p]) => !PLAN_ORDER.includes(p)),
  ]
  const maxPlan = Math.max(...planRows.map(([, n]) => n), 1)

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-overview">
      <PlatformPageHeader
        title="Overview"
        description="What needs you first, then the numbers. Everything here is live across every school."
      />

      {/* ── Needs attention ─────────────────────────────────────────────── */}
      <PlatformSection
        title="Needs attention"
        className="mb-8"
        data-testid="attention-queue"
        data-count={attention.length}
      >
        {attention.length === 0 ? (
          <div
            className="flex items-center gap-3 rounded-lg border border-border bg-card px-5 py-4 text-sm"
            data-testid="attention-all-clear"
          >
            <IconCircleCheck className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <div>
              <p className="font-medium">All clear</p>
              <p className="text-xs text-muted-foreground">
                No payments to confirm, no school past due, every paid plan purchasable.
              </p>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {attention.map((item) => (
              <li key={item.key} className="px-5 py-4" data-testid={`attention-${item.key}`}>
                <div className="flex items-start gap-3">
                  <item.icon
                    className={cn(
                      'mt-0.5 size-5 shrink-0',
                      item.tone === 'danger'
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-amber-600 dark:text-amber-400',
                    )}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          item.tone === 'danger'
                            ? 'text-red-700 dark:text-red-400'
                            : 'text-amber-700 dark:text-amber-400',
                        )}
                      >
                        {item.count}
                      </span>{' '}
                      <span className="font-medium">{item.title}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                    {item.rows && <div className="mt-2 max-w-2xl">{item.rows}</div>}
                  </div>
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
                  >
                    {item.cta}
                    <IconArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PlatformSection>

      {/* ── Numbers ─────────────────────────────────────────────────────── */}
      <StatStrip stats={metrics} className="mb-8" data-testid="platform-metrics" />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* ── Recent schools ───────────────────────────────────────────── */}
        <PlatformSection
          title="Recent schools"
          description="Newest sign-ups first."
          action={
            <Link href="/platform/tenants" className="text-primary hover:underline underline-offset-4">
              All schools
            </Link>
          }
          data-testid="recent-tenants"
        >
          <PlatformPanel>
            {recentRows.length === 0 ? (
              <PlatformEmptyState
                icon={IconSchool}
                title="No schools yet"
                description="The first school someone creates will show up here."
              />
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border">
                  <tr>
                    <th className={TH}>School</th>
                    <th className={TH}>Plan</th>
                    <th className={TH}>Status</th>
                    <th className={TH_RIGHT}>Students</th>
                    <th className={TH_RIGHT}>Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {recentRows.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-muted/40" data-testid="recent-tenant-row">
                      <td className={cn(TD, 'min-w-0')}>
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/platform/tenants/${t.id}`}
                            className="truncate font-medium hover:text-primary hover:underline underline-offset-4"
                          >
                            {t.name}
                          </Link>
                          <a
                            href={t.siteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title={`Open ${t.slug} in a new tab`}
                            aria-label={`Open ${t.name} in a new tab`}
                          >
                            <IconExternalLink className="size-3.5" aria-hidden="true" />
                          </a>
                        </div>
                        <p className="truncate font-mono text-[11px] text-muted-foreground">{t.slug}</p>
                      </td>
                      <td className={TD}>
                        <PlanBadge plan={t.plan} />
                      </td>
                      <td className={TD}>
                        <StatusDot tone={tenantStatusTone(t.status)} label={t.status ?? 'unknown'} />
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{t.students}</td>
                      <td className={cn(TD, 'text-right text-xs text-muted-foreground')}>
                        <RelativeTime value={t.created_at} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PlatformPanel>
        </PlatformSection>

        {/* ── Plan mix ─────────────────────────────────────────────────── */}
        <PlatformSection
          title="Plan mix"
          description={`${totalTenants} active ${totalTenants === 1 ? 'school' : 'schools'}`}
          data-testid="plan-distribution"
        >
          <PlatformPanel className="px-5 py-4">
            {planRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active schools yet.</p>
            ) : (
              <ol className="space-y-3">
                {planRows.map(([plan, count]) => {
                  const pct = Math.round((count / (totalTenants || 1)) * 100)
                  const width = Math.max((count / maxPlan) * 100, 2)
                  return (
                    <li key={plan} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-xs">
                      <span className="capitalize">{plan}</span>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                      </div>
                      <span className="w-16 text-right tabular-nums">
                        <span className="font-medium">{count}</span>{' '}
                        <span className="text-muted-foreground">{pct}%</span>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </PlatformPanel>
        </PlatformSection>
      </div>
    </main>
  )
}
