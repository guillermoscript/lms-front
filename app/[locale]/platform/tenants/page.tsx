import { createAdminClient } from '@/lib/supabase/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8" data-testid="platform-tenants-page">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenants</h1>
          <p className="text-muted-foreground mt-1" data-testid="tenants-count">{rows.length} school(s) found</p>
        </div>
      </div>

      {/* Filters */}
      <form className="mb-6 flex flex-wrap gap-3" data-testid="tenants-filter-form">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name…"
          className="border rounded-md px-3 py-1.5 text-sm bg-background"
          data-testid="tenants-search"
        />
        <select name="plan" defaultValue={plan || ''} className="border rounded-md px-3 py-1.5 text-sm bg-background" data-testid="tenants-plan-filter">
          <option value="">All plans</option>
          {['free', 'starter', 'pro', 'business', 'enterprise'].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select name="status" defaultValue={status || ''} className="border rounded-md px-3 py-1.5 text-sm bg-background" data-testid="tenants-status-filter">
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
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Slug</th>
                  <th className="px-4 py-3 text-left font-medium">Plan</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Students</th>
                  <th className="px-4 py-3 text-right font-medium">Courses</th>
                  <th className="px-4 py-3 text-left font-medium">Created</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tenant) => (
                  <tr key={tenant.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors" data-testid="tenant-row" data-tenant-id={tenant.id}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`./tenants/${tenant.id}`} className="hover:underline">
                        {tenant.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{tenant.slug}</td>
                    <td className="px-4 py-3">
                      <Badge variant={PLAN_BADGE[tenant.plan] || 'outline'} className="capitalize">
                        {tenant.plan}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={tenant.status === 'active' ? 'default' : 'destructive'}>
                        {tenant.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">{tenant.students}</td>
                    <td className="px-4 py-3 text-right">{tenant.courses}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
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
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
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
