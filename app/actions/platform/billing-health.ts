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
import {
  findPartiallyPricedPlans,
  findUnpurchasablePlans,
  type PlanPurchasability,
  type PlatformPlanInput,
  type PlatformPlanPriceInput,
} from '@/lib/billing/plan-prices'
import { getPlatformProviderRuntimeStatuses } from '@/lib/billing/platform-checkout-runtime'

async function verifySuperAdmin() {
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  if (!(await isSuperAdmin())) throw new Error('Super admin only')
  return userId
}

const TENANT_SELECT = 'id, name, plan, access_cutoff_at'
const SUBSCRIPTION_SELECT =
  'tenant_id, status, payment_provider, current_period_end, grace_period_end, updated_at'

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
  payment_provider: string | null
  current_period_end: string | null
  grace_period_end: string | null
  updated_at: string | null
}): PastDueSubscriptionInput {
  return {
    tenantId: row.tenant_id,
    status: row.status,
    // Field and column agree by name since #602. Before that this mapped
    // `payment_provider` onto a field called `paymentMethod`, and every reader
    // compared it against `'manual_transfer'` — a value #601 had retired.
    paymentProvider: row.payment_provider,
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

export interface PlanConfigurationHealth {
  /** Active paid plans with no active provider price — card checkout 400s. */
  unpurchasable: PlanPurchasability[]
  /** Buyable, but not on every interval they quote a price for. */
  partiallyPriced: PlanPurchasability[]
}

/**
 * The plan-configuration half of billing health (#602).
 *
 * Deliberately a separate action from `getAtRiskTenants` rather than another
 * branch inside it: that one returns `AtRiskTenant[]`, and a plan with no price
 * belongs to no tenant. Two reads, its own section on the page.
 *
 * Both tables are small and bounded (five plans, at most a handful of price
 * rows each), so this does not need `fetchAllRows` — but it *is* the check that
 * catches a truncated or empty price table, so it reads every row rather than
 * probing one plan at a time.
 */
export async function getPlanConfigurationHealth(): Promise<PlanConfigurationHealth> {
  await verifySuperAdmin()
  const admin = createAdminClient()

  const [{ data: planRows, error: plansError }, { data: priceRows, error: pricesError }] =
    await Promise.all([
      admin
        .from('platform_plans')
        .select('plan_id, slug, name, price_monthly, price_yearly, is_active')
        .order('sort_order', { ascending: true }),
      admin
        .from('platform_plan_prices')
        .select('price_id, plan_id, payment_provider, interval, provider_price_id, currency, amount, is_active'),
    ])

  // A failed read must not render as "everything is configured" — that is the
  // silent-green failure this whole check exists to prevent.
  if (plansError) throw new Error(`Failed to fetch platform plans: ${plansError.message}`)
  if (pricesError) throw new Error(`Failed to fetch plan prices: ${pricesError.message}`)

  const plans: PlatformPlanInput[] = (planRows || []).map((row) => ({
    planId: row.plan_id,
    slug: row.slug,
    name: row.name,
    priceMonthly: Number(row.price_monthly ?? 0),
    priceYearly: Number(row.price_yearly ?? 0),
    isActive: row.is_active,
  }))

  const prices: PlatformPlanPriceInput[] = (priceRows || []).map((row) => ({
    priceId: row.price_id,
    planId: row.plan_id,
    paymentProvider: row.payment_provider,
    interval: row.interval,
    providerPriceId: row.provider_price_id,
    currency: row.currency,
    amount: row.amount,
    isActive: row.is_active,
  }))
  const providerStatuses = getPlatformProviderRuntimeStatuses()

  return {
    unpurchasable: findUnpurchasablePlans(plans, prices, { providerStatuses }),
    partiallyPriced: findPartiallyPricedPlans(plans, prices, { providerStatuses }),
  }
}
