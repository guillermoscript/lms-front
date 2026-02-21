import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TenantActionsMenu } from './tenant-actions-menu'
import { format } from 'date-fns'

const PLAN_BADGE: Record<string, 'secondary' | 'outline' | 'default' | 'destructive'> = {
  free: 'secondary',
  starter: 'outline',
  pro: 'default',
  business: 'default',
  enterprise: 'default',
}

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string }>
}) {
  const { q, plan, status } = await searchParams
  const adminClient = createAdminClient()

  let query = adminClient
    .from('tenants')
    .select('id, name, slug, plan, status, created_at, stripe_customer_id')
    .order('created_at', { ascending: false })
    .limit(100)

  if (plan) query = query.eq('plan', plan)
  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data: tenants } = await query

  // Get student + course counts per tenant
  const tenantIds = (tenants || []).map(t => t.id)
  const [studentsResult, coursesResult] = await Promise.all([
    adminClient
      .from('tenant_users')
      .select('tenant_id')
      .in('tenant_id', tenantIds)
      .eq('role', 'student')
      .eq('status', 'active'),
    adminClient
      .from('courses')
      .select('tenant_id')
      .in('tenant_id', tenantIds),
  ])

  const studentCounts = (studentsResult.data || []).reduce((acc, r) => {
    acc[r.tenant_id] = (acc[r.tenant_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const courseCounts = (coursesResult.data || []).reduce((acc, r) => {
    acc[r.tenant_id] = (acc[r.tenant_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const rows = (tenants || []).map(t => ({
    ...t,
    students: studentCounts[t.id] || 0,
    courses: courseCounts[t.id] || 0,
  }))

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-tenants-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="tenants-count">{rows.length} school(s) found</p>
        </div>
      </div>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap items-center gap-2" data-testid="tenants-filter-form">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
          className="h-8 rounded-lg border border-border/60 bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          data-testid="tenants-search"
        />
        <select name="plan" defaultValue={plan || ''} className="h-8 rounded-lg border border-border/60 bg-background px-3 text-sm capitalize" data-testid="tenants-plan-filter">
          <option value="">All plans</option>
          {['free', 'starter', 'pro', 'business', 'enterprise'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="status" defaultValue={status || ''} className="h-8 rounded-lg border border-border/60 bg-background px-3 text-sm" data-testid="tenants-status-filter">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="inactive">Inactive</option>
        </select>
        <Button type="submit" size="sm" variant="outline" data-testid="tenants-filter-submit">Filter</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="tenants-table">
              <thead className="border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Slug</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Plan</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Students</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Courses</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Created</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tenant) => (
                  <tr key={tenant.id} className="border-b last:border-0 transition-colors hover:bg-muted/40" data-testid="tenant-row" data-tenant-id={tenant.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`./tenants/${tenant.id}`} className="hover:text-primary transition-colors">
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{tenant.slug}</td>
                    <td className="px-4 py-3">
                      <Badge variant={PLAN_BADGE[tenant.plan] || 'outline'} className="capitalize text-[10px]">
                        {tenant.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={tenant.status === 'active' ? 'default' : 'destructive'}
                        className={`text-[10px] ${tenant.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : ''}`}
                      >
                        {tenant.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{tenant.students}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{tenant.courses}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                      {format(new Date(tenant.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TenantActionsMenu
                        tenantId={tenant.id}
                        tenantName={tenant.name}
                        currentPlan={tenant.plan}
                        isActive={tenant.status === 'active'}
                      />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      No tenants found.
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
