'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isSuperAdmin } from '@/lib/supabase/get-user-role'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { fetchAllRowsIn } from '@/lib/supabase/fetch-all-rows-in'
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

  // All five reads are paged and count-verified (#548). This dashboard exists
  // to make sure no at-risk school goes unnoticed, so a read silently capped
  // at the API row limit defeats its entire purpose: the missing school looks
  // exactly like a healthy one. Each is ordered by its primary key — `tenants`
  // and `platform_subscriptions` have no natural sort here, and an unordered
  // `.range()` window is not a stable page.
  const [pastDueTenants, pastDueSubscriptions, cutoffTenants] = await Promise.all([
    fetchAllRows('tenants:past_due', (from, to) =>
      admin
        .from('tenants')
        .select(TENANT_SELECT, { count: 'exact' })
        .eq('billing_status', 'past_due')
        .order('id')
        .range(from, to)
    ),
    fetchAllRows('platform_subscriptions:past_due', (from, to) =>
      admin
        .from('platform_subscriptions')
        .select(SUBSCRIPTION_SELECT, { count: 'exact' })
        .eq('status', 'past_due')
        .order('subscription_id')
        .range(from, to)
    ),
    fetchAllRows('tenants:access_cutoff', (from, to) =>
      admin
        .from('tenants')
        .select(TENANT_SELECT, { count: 'exact' })
        .not('access_cutoff_at', 'is', null)
        .order('id')
        .range(from, to)
    ),
  ])

  const pastDueTenantRows = pastDueTenants.map(toTenantRow)
  const cutoffTenantRows = cutoffTenants.map(toTenantRow)
  const pastDueSubscriptionRows = pastDueSubscriptions.map(toSubscriptionInput)

  const knownTenantIds = new Set([
    ...pastDueTenantRows.map((t) => t.tenantId),
    ...cutoffTenantRows.map((t) => t.tenantId),
  ])
  const subscriptionPastDueTenantIds = [
    ...new Set(pastDueSubscriptionRows.map((s) => s.tenantId)),
  ]
  // Subscription-only past-due tenants appear in neither read above.
  const missingTenantIds = subscriptionPastDueTenantIds.filter((id) => !knownTenantIds.has(id))

  // Both follow-ups look up by id list, which grows with the reads above — so
  // they are chunked as well as paged: past a few hundred ids the `.in()` URL
  // is the thing that breaks, before any row cap is reached.
  const [extraTenants, knownSubscriptions] = await Promise.all([
    fetchAllRowsIn('tenants:subscription_only', missingTenantIds, (chunk, from, to) =>
      admin.from('tenants').select(TENANT_SELECT, { count: 'exact' }).in('id', chunk).order('id').range(from, to)
    ),
    fetchAllRowsIn('platform_subscriptions:known', [...knownTenantIds], (chunk, from, to) =>
      admin
        .from('platform_subscriptions')
        .select(SUBSCRIPTION_SELECT, { count: 'exact' })
        .in('tenant_id', chunk)
        .order('subscription_id')
        .range(from, to)
    ),
  ])

  return computeBillingHealth(
    mergeAtRiskTenants({
      pastDueTenants: pastDueTenantRows,
      cutoffTenants: cutoffTenantRows,
      subscriptionPastDueTenantIds,
      extraTenants: extraTenants.map(toTenantRow),
    }),
    [...pastDueSubscriptionRows, ...knownSubscriptions.map(toSubscriptionInput)],
    new Date(),
  )
}
