import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { BillingActions } from './billing-actions'

type TabValue = 'pending' | 'confirmed' | 'rejected' | 'all'

const STATUS_BADGE: Record<string, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  pending: 'secondary',
  instructions_sent: 'outline',
  payment_received: 'default',
  confirmed: 'default',
  rejected: 'destructive',
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
    .select('*, platform_plans(name, slug), tenants(name, slug)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (activeTab !== 'all') {
    if (activeTab === 'pending') {
      query = query.in('status', ['pending', 'instructions_sent', 'payment_received'])
    } else {
      query = query.eq('status', activeTab)
    }
  }

  const { data: requests } = await query

  const tabs: { label: string; value: TabValue }[] = [
    { label: 'Pending', value: 'pending' },
    { label: 'Confirmed', value: 'confirmed' },
    { label: 'Rejected', value: 'rejected' },
    { label: 'All', value: 'all' },
  ]

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-billing-page">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Platform Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Manual bank transfer requests from schools.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b" data-testid="billing-tabs">
        {tabs.map(t => (
          <a
            key={t.value}
            href={`?tab=${t.value}`}
            data-testid={`billing-tab-${t.value}`}
            data-active={activeTab === t.value}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="billing-requests-table">
              <thead className="border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">School</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Interval</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Requested</th>
                  <th className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Proof</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(requests || []).map((req: any) => (
                  <tr key={req.request_id} className="border-b last:border-0 transition-colors hover:bg-muted/40" data-testid="billing-request-row" data-request-id={req.request_id} data-status={req.status}>
                    <td className="px-4 py-3 font-medium">
                      {req.tenants?.name || req.tenant_id}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {req.platform_plans?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: req.currency || 'USD' }).format(req.amount)}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{req.interval}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_BADGE[req.status] || 'outline'} className="text-[10px] capitalize">
                        {req.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                      {format(new Date(req.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {req.proof_url ? (
                        <a
                          href={req.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {['pending', 'instructions_sent', 'payment_received'].includes(req.status) && (
                        <BillingActions requestId={req.request_id} />
                      )}
                    </td>
                  </tr>
                ))}
                {(!requests || requests.length === 0) && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
