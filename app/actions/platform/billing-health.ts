'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import {
  computeBillingHealth,
  mergeAtRiskTenants,
  type AtRiskTenant,
  type AtRiskTenantRow,
  type PastDueSubscriptionInput,
} from '@/lib/billing/billing-health'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

const TENANT_SELECT = 'id, name, plan, access_cutoff_at'
const SUBSCRIPTION_SELECT =
  'tenant_id, status, payment_method, current_period_end, grace_period_end, updated_at'

/**
 * Mapped through helpers rather than an `as` cast so a drifting select list
 * fails `tsc` here instead of rendering blanks in production.
 */
function toTenantRow(row: {
  id: string
  name: string
  plan: string | null
  access_cutoff_at: string | null
}): AtRiskTenantRow {
  return {
    tenantId: row.id,
    tenantName: row.name,
    plan: row.plan,
    accessCutoffAt: row.access_cutoff_at,
  }
}

function toSubscriptionInput(row: {
  tenant_id: string
  status: string | null
  payment_method: string | null
  current_period_end: string | null
  grace_period_end: string | null
  updated_at: string | null
}): PastDueSubscriptionInput {
  return {
    tenantId: row.tenant_id,
    status: row.status,
    paymentMethod: row.payment_method,
    currentPeriodEnd: row.current_period_end,
    gracePeriodEnd: row.grace_period_end,
    updatedAt: row.updated_at,
  }
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
 *
 * Two round-trips, not four. The past-due subscription read takes the full
 * column set, so the rows belonging to subscription-only tenants are already
 * in hand; that makes the follow-up `tenants` fetch for those ids independent
 * of the subscription fetch for the tenants we already know about, and the two
 * go out together. Feeding both subscription lists to `computeBillingHealth`
 * is safe because it ranks duplicate rows rather than taking the last one.
 *
 * The auth check deliberately stays *before* the reads and is never folded
 * into the `Promise.all` — a non-super-admin caller must not cause tenant
 * billing data to be read at all.
 */
export async function getAtRiskTenants(): Promise<AtRiskTenant[]> {
  await verifySuperAdmin()
  const admin = createAdminClient()

  const [
    { data: pastDueTenants },
    { data: pastDueSubscriptions },
    { data: cutoffTenants },
  ] = await Promise.all([
    admin.from('tenants').select(TENANT_SELECT).eq('billing_status', 'past_due'),
    admin.from('platform_subscriptions').select(SUBSCRIPTION_SELECT).eq('status', 'past_due'),
    admin.from('tenants').select(TENANT_SELECT).not('access_cutoff_at', 'is', null),
  ])

  const pastDueTenantRows = (pastDueTenants ?? []).map(toTenantRow)
  const cutoffTenantRows = (cutoffTenants ?? []).map(toTenantRow)
  const pastDueSubscriptionRows = (pastDueSubscriptions ?? []).map(toSubscriptionInput)

  const knownTenantIds = new Set([
    ...pastDueTenantRows.map((t) => t.tenantId),
    ...cutoffTenantRows.map((t) => t.tenantId),
  ])
  const subscriptionPastDueTenantIds = [
    ...new Set(pastDueSubscriptionRows.map((s) => s.tenantId)),
  ]
  // Subscription-only past-due tenants appear in neither read above.
  const missingTenantIds = subscriptionPastDueTenantIds.filter((id) => !knownTenantIds.has(id))

  const [{ data: extraTenants }, { data: knownSubscriptions }] = await Promise.all([
    missingTenantIds.length
      ? admin.from('tenants').select(TENANT_SELECT).in('id', missingTenantIds)
      : Promise.resolve({ data: [] as never[] }),
    knownTenantIds.size
      ? admin
          .from('platform_subscriptions')
          .select(SUBSCRIPTION_SELECT)
          .in('tenant_id', [...knownTenantIds])
      : Promise.resolve({ data: [] as never[] }),
  ])

  return computeBillingHealth(
    mergeAtRiskTenants({
      pastDueTenants: pastDueTenantRows,
      cutoffTenants: cutoffTenantRows,
      subscriptionPastDueTenantIds,
      extraTenants: (extraTenants ?? []).map(toTenantRow),
    }),
    [...pastDueSubscriptionRows, ...(knownSubscriptions ?? []).map(toSubscriptionInput)],
    new Date(),
  )
}
