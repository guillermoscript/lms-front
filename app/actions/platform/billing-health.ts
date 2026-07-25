'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import {
  computeBillingHealth,
  type AtRiskReason,
  type AtRiskTenant,
} from '@/lib/billing/billing-health'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

/**
 * #514: "at risk" is a union across two tables, which PostgREST cannot express
 * as a single `.or()`. Three reads, merged by tenant id:
 *
 *  1. `tenants.billing_status = 'past_due'`
 *  2. tenants owning a `platform_subscriptions` row with `status = 'past_due'`
 *     (drifts from #1 when only one side is synced)
 *  3. `tenants.access_cutoff_at IS NOT NULL` (#494 scheduled a cutoff — the
 *     tenant may be paying perfectly well and simply be over its plan limits)
 *
 * Each contributes a reason, so the UI can keep the three cases apart.
 */
export async function getAtRiskTenants(): Promise<AtRiskTenant[]> {
  await verifySuperAdmin()
  const admin = createAdminClient()

  const [
    { data: pastDueTenants },
    { data: pastDueSubscriptions },
    { data: cutoffTenants },
  ] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, plan, access_cutoff_at')
      .eq('billing_status', 'past_due'),
    admin
      .from('platform_subscriptions')
      .select('tenant_id')
      .eq('status', 'past_due'),
    admin
      .from('tenants')
      .select('id, name, plan, access_cutoff_at')
      .not('access_cutoff_at', 'is', null),
  ])

  const reasonsByTenant = new Map<string, Set<AtRiskReason>>()
  const addReason = (tenantId: string, reason: AtRiskReason) => {
    const existing = reasonsByTenant.get(tenantId)
    if (existing) existing.add(reason)
    else reasonsByTenant.set(tenantId, new Set([reason]))
  }

  type TenantRow = { id: string; name: string; plan: string | null; access_cutoff_at: string | null }
  const tenantById = new Map<string, TenantRow>()

  for (const tenant of (pastDueTenants || []) as TenantRow[]) {
    tenantById.set(tenant.id, tenant)
    addReason(tenant.id, 'tenant_past_due')
  }
  for (const tenant of (cutoffTenants || []) as TenantRow[]) {
    tenantById.set(tenant.id, tenant)
    addReason(tenant.id, 'access_cutoff_scheduled')
  }

  // Subscription-only past-due tenants have no row yet from either read above.
  const subscriptionPastDueIds = [...new Set((pastDueSubscriptions || []).map((s) => s.tenant_id))]
  for (const tenantId of subscriptionPastDueIds) {
    addReason(tenantId, 'subscription_past_due')
  }
  const missingTenantIds = subscriptionPastDueIds.filter((id) => !tenantById.has(id))

  if (missingTenantIds.length) {
    const { data: extraTenants } = await admin
      .from('tenants')
      .select('id, name, plan, access_cutoff_at')
      .in('id', missingTenantIds)
    for (const tenant of (extraTenants || []) as TenantRow[]) {
      tenantById.set(tenant.id, tenant)
    }
  }

  const tenantIds = [...tenantById.keys()]

  const { data: subscriptions } = tenantIds.length
    ? await admin
        .from('platform_subscriptions')
        .select('tenant_id, status, payment_method, current_period_end, grace_period_end, updated_at')
        .in('tenant_id', tenantIds)
    : { data: [] }

  return computeBillingHealth(
    [...tenantById.values()].map((t) => ({
      tenantId: t.id,
      tenantName: t.name,
      plan: t.plan,
      accessCutoffAt: t.access_cutoff_at,
      reasons: [...(reasonsByTenant.get(t.id) ?? [])],
    })),
    (subscriptions || []).map((s) => ({
      tenantId: s.tenant_id,
      status: s.status,
      paymentMethod: s.payment_method,
      currentPeriodEnd: s.current_period_end,
      gracePeriodEnd: s.grace_period_end,
      updatedAt: s.updated_at,
    })),
    new Date(),
  )
}
