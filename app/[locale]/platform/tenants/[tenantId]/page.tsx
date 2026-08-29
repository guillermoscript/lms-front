import Link from 'next/link'
import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { IconAlertTriangle, IconArrowLeft, IconExternalLink, IconReceipt, IconUsers } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { netOfRefunds } from '@/lib/payments/payouts-owed'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { StatStrip } from '@/components/platform/stat-strip'
import { PlatformPanel, PlatformSection, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { RelativeTime } from '@/components/platform/relative-time'
import { PlanBadge, StatusDot, billingStatusTone, tenantStatusTone } from '@/components/platform/badges'
import { TenantActionsMenu } from '../tenant-actions-menu'
import { cn } from '@/lib/utils'

const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n ?? 0)

const TX_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  successful: 'ok',
  pending: 'warn',
  failed: 'bad',
  refunded: 'bad',
  canceled: 'muted',
  archived: 'muted',
}

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ locale: string; tenantId: string }>
}) {
  const { locale, tenantId } = await params
  const adminClient = createAdminClient()

  const { data: tenant } = await adminClient
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single()

  if (!tenant) notFound()

  // Parallel queries for tenant stats
  const [
    { count: studentCount },
    { count: courseCount },
    { data: recentTransactions },
    { data: adminUsers },
    { data: subscription },
    siteUrl,
  ] = await Promise.all([
    adminClient
      .from('tenant_users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .eq('status', 'active'),
    adminClient
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId),
    adminClient
      .from('transactions')
      .select('transaction_id, amount, refunded_amount, status, transaction_date, payment_provider')
      .eq('tenant_id', tenantId)
      .order('transaction_date', { ascending: false })
      .limit(20),
    adminClient
      .from('tenant_users')
      .select('user_id, joined_at')
      .eq('tenant_id', tenantId)
      .eq('role', 'admin')
      .eq('status', 'active'),
    adminClient
      .from('platform_subscriptions')
      .select('*, platform_plans(name, slug)')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    getTenantSiteUrl(tenant.slug),
  ])

  const recentRevenue = (recentTransactions || [])
    .filter(t => t.status === 'successful')
    // Net of refunds (#547) — a partially refunded sale is still 'successful'.
    .reduce((sum, t) => sum + netOfRefunds(t.amount || 0, t.refunded_amount), 0)

  // Fetch profiles for admin users separately (more reliable than FK embedding)
  const adminUserIds = (adminUsers || []).map(u => u.user_id)
  const { data: adminProfiles } = adminUserIds.length > 0
    ? await adminClient.from('profiles').select('id, full_name').in('id', adminUserIds)
    : { data: [] }
  const profileMap = (adminProfiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {} as Record<string, string>)

  const billingStatus = tenant.billing_status ?? 'active'
  const isActive = tenant.status === 'active'
  const subscriptionPlan = (subscription?.platform_plans as { name: string; slug: string } | null) ?? null
  // `tenants.plan` is what feature gating reads; the subscription is what was
  // paid for. When they disagree (a forced plan change, a webhook that never
  // landed) the operator needs to see it here, not discover it from a support ticket.
  const planMismatch =
    subscriptionPlan && subscription?.status === 'active' && subscriptionPlan.slug !== (tenant.plan ?? 'free')

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="tenant-detail-page">
      <PlatformPageHeader
        meta={
          <Link
            href={`/${locale}/platform/tenants`}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <IconArrowLeft className="size-3.5" aria-hidden="true" />
            All schools
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {tenant.name}
            <span className="flex items-center gap-2 text-sm font-normal">
              <PlanBadge plan={tenant.plan} />
              <StatusDot tone={tenantStatusTone(tenant.status)} label={tenant.status ?? 'unknown'} />
            </span>
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs hover:text-foreground hover:underline underline-offset-4"
              data-testid="tenant-open-site"
            >
              {siteUrl.replace(/^https?:\/\//, '')}
              <IconExternalLink className="size-3" aria-hidden="true" />
            </a>
            <span aria-hidden="true">·</span>
            <span>
              {tenant.created_at ? (
                <>
                  Joined {format(new Date(tenant.created_at), 'MMMM d, yyyy')} (<RelativeTime value={tenant.created_at} />)
                </>
              ) : (
                'Join date unknown'
              )}
            </span>
          </span>
        }
        actions={
          <TenantActionsMenu
            tenantId={tenantId}
            tenantName={tenant.name}
            currentPlan={tenant.plan ?? 'free'}
            isActive={isActive}
          />
        }
      />

      <StatStrip
        className="mb-8"
        data-testid="tenant-stats"
        stats={[
          { label: 'Active students', value: studentCount ?? 0 },
          { label: 'Courses', value: courseCount ?? 0 },
          {
            label: 'Net revenue',
            value: usd(recentRevenue),
            detail:
              (recentTransactions?.length ?? 0) === 1
                ? 'Net of refunds · last transaction'
                : `Net of refunds · last ${recentTransactions?.length ?? 0} transactions`,
          },
          {
            label: 'Billing',
            value: <span className="capitalize">{billingStatus.replace(/_/g, ' ')}</span>,
            tone: billingStatus === 'past_due' ? 'danger' : 'default',
            detail: tenant.access_cutoff_at
              ? `Access cutoff ${format(new Date(tenant.access_cutoff_at), 'MMM d, yyyy')}`
              : subscription?.current_period_end
                ? `Renews ${format(new Date(subscription.current_period_end), 'MMM d, yyyy')}`
                : 'No paid subscription',
          },
        ]}
      />

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Subscription */}
        <PlatformSection title="Platform subscription" data-testid="tenant-subscription">
          <PlatformPanel className="px-5 py-4">
            {subscription ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Plan</dt>
                <dd className="font-medium capitalize">
                  {subscriptionPlan?.name ?? '—'}
                  {planMismatch && (
                    <span
                      className="ml-2 inline-flex items-center gap-1 text-xs font-normal normal-case text-amber-700 dark:text-amber-400"
                      data-testid="tenant-plan-mismatch"
                    >
                      <IconAlertTriangle className="size-3.5" aria-hidden="true" />
                      School is gated as <span className="capitalize">{tenant.plan ?? 'free'}</span>
                    </span>
                  )}
                </dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusDot tone={billingStatusTone(subscription.status)} label={(subscription.status ?? 'unknown').replace(/_/g, ' ')} />
                </dd>
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="capitalize">{subscription.payment_provider ?? '—'}</dd>
                <dt className="text-muted-foreground">Interval</dt>
                <dd className="capitalize">{subscription.interval}</dd>
                {subscription.current_period_end && (
                  <>
                    <dt className="text-muted-foreground">Current period ends</dt>
                    <dd>
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}{' '}
                      <span className="text-muted-foreground">(<RelativeTime value={subscription.current_period_end} />)</span>
                    </dd>
                  </>
                )}
                {subscription.grace_period_end && (
                  <>
                    <dt className="text-muted-foreground">Grace ends</dt>
                    <dd className="text-red-700 dark:text-red-400">
                      {format(new Date(subscription.grace_period_end), 'MMM d, yyyy')}
                    </dd>
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                On the free plan — no platform subscription. Use <span className="font-medium text-foreground">Change plan</span> in the
                actions menu to move them manually.
              </p>
            )}
          </PlatformPanel>
        </PlatformSection>

        {/* Admin Users */}
        <PlatformSection
          title="Admins"
          description="People who can run this school."
          data-testid="tenant-admins"
        >
          <PlatformPanel>
            {(!adminUsers || adminUsers.length === 0) ? (
              <PlatformEmptyState
                icon={IconUsers}
                title="No active admins"
                description="This school has no one who can manage it — likely a half-finished sign-up."
                className="py-8"
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {adminUsers.map((u) => (
                  <li key={u.user_id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <span className="truncate font-medium">{profileMap[u.user_id] || 'Unnamed admin'}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {u.joined_at ? <>Joined <RelativeTime value={u.joined_at} /></> : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PlatformPanel>
        </PlatformSection>

        {/* Recent Transactions */}
        <PlatformSection
          title="Recent transactions"
          description="Student purchases at this school, newest first."
          className="lg:col-span-2"
          data-testid="tenant-transactions"
        >
          <PlatformPanel>
            {(!recentTransactions || recentTransactions.length === 0) ? (
              <PlatformEmptyState
                icon={IconReceipt}
                title="No transactions yet"
                description="Sales show up here once a student buys a product or plan from this school."
                className="py-8"
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border">
                    <tr>
                      <th className={TH}>ID</th>
                      <th className={TH}>Provider</th>
                      <th className={TH}>Status</th>
                      <th className={TH_RIGHT}>Amount</th>
                      <th className={TH_RIGHT}>Refunded</th>
                      <th className={TH_RIGHT}>Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {recentTransactions.map((t) => (
                      <tr key={t.transaction_id}>
                        {/* `transaction_id` is a bigint PK, not a uuid — `.slice()` on it
                            threw `TypeError: t.transaction_id.slice is not a function`
                            and took the whole tenant page down (LMS-FRONT-94). */}
                        <td className={cn(TD, 'font-mono text-xs text-muted-foreground')}>#{t.transaction_id}</td>
                        <td className={cn(TD, 'capitalize text-muted-foreground')}>{t.payment_provider ?? '—'}</td>
                        <td className={TD}>
                          <StatusDot tone={TX_TONE[t.status ?? ''] ?? 'muted'} label={t.status ?? 'unknown'} />
                        </td>
                        <td className={cn(TD, 'text-right font-medium tabular-nums')}>{usd(t.amount)}</td>
                        <td className={cn(TD, 'text-right tabular-nums text-muted-foreground')}>
                          {t.refunded_amount ? usd(t.refunded_amount) : '—'}
                        </td>
                        <td className={cn(TD, 'text-right text-xs text-muted-foreground tabular-nums')}>
                          {format(new Date(t.transaction_date), 'MMM d, yyyy')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PlatformPanel>
        </PlatformSection>
      </div>
    </main>
  )
}
