import Link from 'next/link'
import { format } from 'date-fns'
import { IconExternalLink, IconReceipt } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { PlatformPanel, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { RelativeTime } from '@/components/platform/relative-time'
import { StatusDot } from '@/components/platform/badges'
import { BillingActions } from './billing-actions'
import { cn } from '@/lib/utils'

type TabValue = 'pending' | 'confirmed' | 'rejected' | 'all'

const OPEN_STATUSES = ['pending', 'instructions_sent', 'payment_received']

const STATUS_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'muted'> = {
  pending: 'warn',
  instructions_sent: 'warn',
  payment_received: 'warn',
  confirmed: 'ok',
  rejected: 'bad',
  expired: 'muted',
  canceled: 'muted',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting instructions',
  instructions_sent: 'Instructions sent',
  payment_received: 'Payment reported',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
}

const EMPTY_COPY: Record<TabValue, { title: string; description: string }> = {
  pending: {
    title: 'Nothing waiting on you',
    description: 'Manual transfer requests from schools land here until you confirm or reject them.',
  },
  confirmed: { title: 'No confirmed requests yet', description: 'Requests you confirm move here.' },
  rejected: { title: 'No rejected requests', description: 'Requests you reject, with your reason, move here.' },
  all: { title: 'No payment requests yet', description: 'Schools that pick "bank transfer" at checkout create one.' },
}

export default async function PlatformBillingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = (tab || 'pending') as TabValue
  const adminClient = createAdminClient()

  let query = adminClient
    .from('platform_payment_requests')
    .select('*, platform_plans(name, slug, price_monthly, price_yearly), tenants(name, slug)')
    .order('created_at', { ascending: activeTab === 'pending' })
    .limit(100)

  if (activeTab !== 'all') {
    if (activeTab === 'pending') {
      query = query.in('status', OPEN_STATUSES)
    } else {
      query = query.eq('status', activeTab)
    }
  }

  const head = (statuses: string[]) =>
    adminClient
      .from('platform_payment_requests')
      .select('*', { count: 'exact', head: true })
      .in('status', statuses)

  const [{ data: requests }, { count: pendingCount }, { count: confirmedCount }, { count: rejectedCount }] =
    await Promise.all([query, head(OPEN_STATUSES), head(['confirmed']), head(['rejected'])])

  const tabs: { label: string; value: TabValue; count?: number }[] = [
    { label: 'Pending', value: 'pending', count: pendingCount ?? 0 },
    { label: 'Confirmed', value: 'confirmed', count: confirmedCount ?? 0 },
    { label: 'Rejected', value: 'rejected', count: rejectedCount ?? 0 },
    { label: 'All', value: 'all' },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-billing-page">
      <PlatformPageHeader
        title="Payment requests"
        description="Bank transfers schools have asked to pay by. Confirming one upgrades the school; rejecting keeps it where it is."
      />

      {/* Tabs */}
      <nav className="mb-4 flex gap-1 border-b border-border" data-testid="billing-tabs" aria-label="Request status">
        {tabs.map(t => {
          const isActive = activeTab === t.value
          return (
            <a
              key={t.value}
              href={`?tab=${t.value}`}
              data-testid={`billing-tab-${t.value}`}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors',
                isActive
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px text-[10px] tabular-nums',
                    isActive ? 'bg-foreground/10' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {t.count}
                </span>
              )}
            </a>
          )
        })}
      </nav>

      <PlatformPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="billing-requests-table">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>School</th>
                <th className={TH}>Plan</th>
                <th className={TH_RIGHT}>Amount</th>
                <th className={TH}>Status</th>
                <th className={TH}>Requested</th>
                <th className={TH}>Proof</th>
                <th className={TH_RIGHT}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(requests ?? []).map((req) => {
                // Item 5: `amount` is the price snapshotted at request time.
                // Surface the plan's *current* price so a super admin can see
                // if it drifted (e.g. the plan was re-priced before confirm).
                const currentPlanPrice =
                  req.interval === 'yearly'
                    ? req.platform_plans?.price_yearly
                    : req.platform_plans?.price_monthly
                const priceDrifted =
                  typeof currentPlanPrice === 'number' &&
                  Number(currentPlanPrice) !== Number(req.amount)
                const fmt = (n: number) =>
                  new Intl.NumberFormat('en-US', { style: 'currency', currency: req.currency || 'USD' }).format(n)
                const isOpen = OPEN_STATUSES.includes(req.status)
                return (
                  <tr
                    key={req.request_id}
                    className="transition-colors hover:bg-muted/40"
                    data-testid="billing-request-row"
                    data-request-id={req.request_id}
                    data-status={req.status}
                  >
                    <td className={cn(TD, 'min-w-0')}>
                      <Link
                        href={`/platform/tenants/${req.tenant_id}`}
                        className="font-medium hover:text-primary hover:underline underline-offset-4"
                      >
                        {req.tenants?.name || req.tenant_id}
                      </Link>
                      {req.tenants?.slug && (
                        <p className="font-mono text-[11px] text-muted-foreground">{req.tenants.slug}</p>
                      )}
                    </td>
                    <td className={cn(TD, 'text-muted-foreground')}>
                      <span className="capitalize">{req.platform_plans?.name || '—'}</span>
                      <span className="text-muted-foreground/70"> · {req.interval}</span>
                    </td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums')}>
                      {fmt(req.amount)}
                      {priceDrifted && (
                        <span
                          className="mt-0.5 block text-[10px] font-normal text-amber-700 dark:text-amber-400"
                          data-testid="price-drift-note"
                          title="The plan price changed after this request was created."
                        >
                          plan now {fmt(currentPlanPrice)}
                        </span>
                      )}
                    </td>
                    <td className={TD}>
                      <StatusDot
                        tone={STATUS_TONE[req.status] ?? 'muted'}
                        label={STATUS_LABEL[req.status] ?? req.status.replace(/_/g, ' ')}
                        className="normal-case"
                      />
                      {/* The super admin's reason for the decision (#615). Without it
                          rendered somewhere, `admin_notes` is a write-only column and
                          the row stops being an audit record. */}
                      {req.admin_notes && (
                        <span
                          className="mt-1 block max-w-[18rem] text-[11px] leading-snug text-muted-foreground"
                          data-testid="request-admin-note"
                        >
                          {req.admin_notes}
                        </span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-xs text-muted-foreground')}>
                      <RelativeTime value={req.created_at} />
                      <span className="block text-[11px] text-muted-foreground/70 tabular-nums">
                        {req.created_at ? format(new Date(req.created_at), 'MMM d, yyyy') : ''}
                      </span>
                    </td>
                    <td className={TD}>
                      {req.proof_url ? (
                        <a
                          href={req.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-4"
                        >
                          View proof
                          <IconExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">None attached</span>
                      )}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      {isOpen && <BillingActions requestId={req.request_id} status={req.status} />}
                    </td>
                  </tr>
                )
              })}
              {(!requests || requests.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <PlatformEmptyState
                      icon={IconReceipt}
                      title={EMPTY_COPY[activeTab]?.title ?? 'No requests'}
                      description={EMPTY_COPY[activeTab]?.description}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PlatformPanel>
    </main>
  )
}
