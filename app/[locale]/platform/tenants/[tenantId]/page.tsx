import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { IconArrowLeft } from '@tabler/icons-react'
import { TenantActionsMenu } from '../tenant-actions-menu'

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
      .select('transaction_id, amount, status, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
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
  ])

  const monthlyRevenue = (recentTransactions || [])
    .filter(t => t.status === 'successful')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  // Fetch profiles for admin users separately (more reliable than FK embedding)
  const adminUserIds = (adminUsers || []).map(u => u.user_id)
  const { data: adminProfiles } = adminUserIds.length > 0
    ? await adminClient.from('profiles').select('id, full_name').in('id', adminUserIds)
    : { data: [] }
  const profileMap = (adminProfiles || []).reduce((acc, p) => ({ ...acc, [p.id]: p.full_name }), {} as Record<string, string>)

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="tenant-detail-page">
      <div className="mb-6 flex items-center gap-4">
        <Link href={`/${locale}/platform/tenants`}>
          <Button variant="ghost" size="icon">
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{tenant.name}</h1>
            <Badge variant={tenant.status === 'active' ? 'default' : 'destructive'}>
              {tenant.status}
            </Badge>
            <Badge variant="outline" className="capitalize">{tenant.plan}</Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {tenant.slug} · Created {format(new Date(tenant.created_at), 'MMMM d, yyyy')}
          </p>
        </div>
        <TenantActionsMenu
          tenantId={tenantId}
          tenantName={tenant.name}
          currentPlan={tenant.plan}
          isActive={tenant.status === 'active'}
        />
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-3" data-testid="tenant-stats">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Students</p>
            <p className="text-3xl font-bold mt-1">{studentCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Courses</p>
            <p className="text-3xl font-bold mt-1">{courseCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Revenue (last 20 txn)</p>
            <p className="text-3xl font-bold mt-1">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(monthlyRevenue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Subscription */}
        <Card>
          <CardHeader><CardTitle>Platform Subscription</CardTitle></CardHeader>
          <CardContent>
            {subscription ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium capitalize">{(subscription.platform_plans as any)?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'}>
                    {subscription.status}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interval</span>
                  <span>{subscription.interval}</span>
                </div>
                {subscription.current_period_end && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Renews</span>
                    <span>{format(new Date(subscription.current_period_end), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active subscription (free plan).</p>
            )}
          </CardContent>
        </Card>

        {/* Admin Users */}
        <Card>
          <CardHeader><CardTitle>Admin Users</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(adminUsers || []).map((u: any) => (
                <div key={u.user_id} className="flex items-center justify-between text-sm">
                  <span>{profileMap[u.user_id] || 'Unknown'}</span>
                  <span className="text-xs text-muted-foreground">
                    {u.joined_at ? format(new Date(u.joined_at), 'MMM d, yyyy') : '—'}
                  </span>
                </div>
              ))}
              {(!adminUsers || adminUsers.length === 0) && (
                <p className="text-sm text-muted-foreground">No admins found.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(recentTransactions || []).map((t) => (
                    <tr key={t.transaction_id} className="border-b last:border-0">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {t.transaction_id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={t.status === 'successful' ? 'default' : t.status === 'pending' ? 'secondary' : 'destructive'}
                        >
                          {t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {format(new Date(t.created_at), 'MMM d, yyyy')}
                      </td>
                    </tr>
                  ))}
                  {(!recentTransactions || recentTransactions.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        No transactions yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
