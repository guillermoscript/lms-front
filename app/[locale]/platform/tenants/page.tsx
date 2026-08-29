import Link from 'next/link'
import { IconExternalLink, IconSchool } from '@tabler/icons-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTenantSiteUrl } from '@/lib/platform/tenant-site-url'
import { PlatformPageHeader } from '@/components/platform/page-header'
import { PlatformPanel, TD, TH, TH_RIGHT } from '@/components/platform/section'
import { PlatformEmptyState } from '@/components/platform/empty-state'
import { RelativeTime } from '@/components/platform/relative-time'
import { PlanBadge, StatusDot, billingStatusTone, tenantStatusTone } from '@/components/platform/badges'
import { TenantActionsMenu } from './tenant-actions-menu'
import { TenantFilters } from './tenant-filters'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 100

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; plan?: string; status?: string }>
}) {
  const { q, plan, status } = await searchParams
  const adminClient = createAdminClient()

  let query = adminClient
    .from('tenants')
    .select('id, name, slug, plan, status, billing_status, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE)

  if (plan) query = query.eq('plan', plan)
  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data: tenants, count } = await query
  const total = count ?? tenants?.length ?? 0

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

  const rows = await Promise.all(
    (tenants || []).map(async (t) => ({
      ...t,
      students: studentCounts[t.id] || 0,
      courses: courseCounts[t.id] || 0,
      siteUrl: await getTenantSiteUrl(t.slug),
    })),
  )

  const hasFilters = Boolean(q || plan || status)
  const countCopy =
    total > rows.length
      ? `Showing the newest ${rows.length} of ${total} schools`
      : `${total} ${total === 1 ? 'school' : 'schools'}${hasFilters ? ' match' : ''}`

  return (
    <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8" data-testid="platform-tenants-page">
      <PlatformPageHeader
        title="Schools"
        description={<span data-testid="tenants-count">{countCopy}</span>}
      />

      <TenantFilters q={q} plan={plan} status={status} />

      <PlatformPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="tenants-table">
            <thead className="border-b border-border">
              <tr>
                <th className={TH}>School</th>
                <th className={TH}>Plan</th>
                <th className={TH}>Status</th>
                <th className={TH}>Billing</th>
                <th className={TH_RIGHT}>Students</th>
                <th className={TH_RIGHT}>Courses</th>
                <th className={TH_RIGHT}>Joined</th>
                <th className={TH_RIGHT}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((tenant) => (
                <tr
                  key={tenant.id}
                  className="transition-colors hover:bg-muted/40"
                  data-testid="tenant-row"
                  data-tenant-id={tenant.id}
                >
                  <td className={cn(TD, 'min-w-0')}>
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`./tenants/${tenant.id}`}
                        className="truncate font-medium hover:text-primary hover:underline underline-offset-4"
                      >
                        {tenant.name}
                      </Link>
                      <a
                        href={tenant.siteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title={`Open ${tenant.slug} in a new tab`}
                        aria-label={`Open ${tenant.name} in a new tab`}
                        data-testid="tenant-open-site"
                      >
                        <IconExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{tenant.slug}</p>
                  </td>
                  <td className={TD}>
                    <PlanBadge plan={tenant.plan} />
                  </td>
                  <td className={TD}>
                    <StatusDot tone={tenantStatusTone(tenant.status)} label={tenant.status ?? 'unknown'} />
                  </td>
                  <td className={TD}>
                    <StatusDot
                      tone={billingStatusTone(tenant.billing_status)}
                      label={(tenant.billing_status ?? 'active').replace(/_/g, ' ')}
                    />
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{tenant.students}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{tenant.courses}</td>
                  <td className={cn(TD, 'text-right text-xs text-muted-foreground')}>
                    <RelativeTime value={tenant.created_at} />
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    <TenantActionsMenu
                      tenantId={tenant.id}
                      tenantName={tenant.name}
                      currentPlan={tenant.plan ?? 'free'}
                      isActive={tenant.status === 'active'}
                    />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-0">
                    <PlatformEmptyState
                      icon={IconSchool}
                      title={hasFilters ? 'No schools match these filters' : 'No schools yet'}
                      description={
                        hasFilters
                          ? 'Try a shorter name, or widen the plan and status filters.'
                          : 'Schools appear here as soon as someone creates one.'
                      }
                      action={
                        hasFilters ? (
                          <Link href="?" className="text-primary hover:underline underline-offset-4">
                            Clear filters
                          </Link>
                        ) : undefined
                      }
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
