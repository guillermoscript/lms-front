/**
 * What a product sale charges, resolved ONE way for every surface that shows
 * or takes the money (issue #927 review).
 *
 * The checkout page (what the buyer is shown), the Stripe Connect route and the
 * unified hosted-checkout route (what the buyer is charged) all go through
 * `resolveProductCharge()`, so the displayed amount and the charged amount are
 * derived from the same inputs by the same code and cannot drift apart.
 *
 * The split is read for the PRODUCT's tenant on the service-role client, with
 * the tenant pinned explicitly. It used to be read on the buyer's user-scoped
 * client, where `revenue_splits` RLS (`tenant_id = get_tenant_id()`, taken from
 * the buyer's JWT) returns nothing for a buyer whose token belongs to another
 * school — so the page fell back to one percentage, the Stripe route to
 * another, and the buyer was shown one number and charged a different one.
 *
 * Missing split:
 *   - `student` bearer → `FeeSplitUnavailableError`. The gross-up IS the split;
 *     guessing it would charge the buyer a surcharge nobody configured, or
 *     silently drop it and short the school. Fail loudly instead.
 *   - `school` bearer → the documented default split (80/20, the same COALESCE
 *     the #512 snapshot trigger uses). The buyer pays the listed price either
 *     way, so the fallback only affects the fee, exactly as before.
 * A query ERROR is never a missing split: it throws for both bearers.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_SCHOOL_PERCENTAGE } from './payouts-owed'
import { chargedAmount, effectiveFeeBearer, type FeeBearer } from './fee-bearer'

/** The tenant's split, or null when the tenant has no `revenue_splits` row. */
export interface TenantRevenueSplit {
  /** Platform's cut, 0–100. */
  platformPercentage: number
  /** School's share, 0–100 (`platform + school = 100`, enforced by a CHECK). */
  schoolPercentage: number
}

/** Thrown when the student bears the fee but the tenant has no split on file. */
export class FeeSplitUnavailableError extends Error {
  readonly code = 'FEE_SPLIT_UNAVAILABLE'
  constructor(readonly tenantId: string) {
    super(`No revenue split configured for tenant ${tenantId}; cannot price a student-borne platform fee`)
    this.name = 'FeeSplitUnavailableError'
  }
}

/** The fields of a `products` row the charge depends on. */
export interface ChargeableProduct {
  tenant_id: string
  price: number | string
  currency: string | null
  payment_provider: string | null
  fee_bearer?: string | null
}

export interface ProductCharge {
  /** The listed price, major units. */
  price: number
  /** What the buyer is charged, major units (grossed up when the student bears the fee). */
  amount: number
  /** Lower-case ISO currency. */
  currency: string
  /** The bearer that actually applies — snapshot this on `transactions.fee_bearer`. */
  feeBearer: FeeBearer
  /** Platform's cut used for the fee / gross-up, 0–100. */
  platformPercentage: number
  /** School's share, 0–100 — what `school_percentage_snapshot` will hold. */
  schoolPercentage: number
  /** True when `amount` includes a surcharge on top of `price`. */
  feeIncluded: boolean
}

const DEFAULT_SPLIT: TenantRevenueSplit = {
  platformPercentage: 100 - DEFAULT_SCHOOL_PERCENTAGE,
  schoolPercentage: DEFAULT_SCHOOL_PERCENTAGE,
}

/**
 * Read a tenant's split on the service-role client, tenant pinned explicitly.
 * Throws on a query error; returns null only when there is genuinely no row.
 */
export async function getTenantRevenueSplit(
  tenantId: string,
  admin: SupabaseClient = createAdminClient(),
): Promise<TenantRevenueSplit | null> {
  const { data, error } = await admin
    .from('revenue_splits')
    .select('tenant_id, platform_percentage, school_percentage')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) throw new Error(`revenue_splits lookup failed for tenant ${tenantId}: ${error.message}`)
  if (!data) return null
  if (data.tenant_id !== tenantId) throw new Error('revenue_splits tenant mismatch')

  const school = Number(data.school_percentage)
  if (!Number.isFinite(school) || school < 0 || school > 100) {
    throw new Error(`revenue_splits for tenant ${tenantId} has an invalid school_percentage`)
  }
  // Derived from school_percentage, the column the snapshot trigger and every
  // payout sum read, so the gross-up and the school's share use one number.
  return { schoolPercentage: school, platformPercentage: 100 - school }
}

/** Split with the documented default for a tenant that has none (school bearer only). */
export function splitOrDefault(split: TenantRevenueSplit | null): TenantRevenueSplit {
  return split ?? DEFAULT_SPLIT
}

/**
 * Pure core of `resolveProductCharge` — exported for tests and for callers
 * that already hold the split.
 */
export function computeProductCharge(
  product: ChargeableProduct,
  split: TenantRevenueSplit | null,
): ProductCharge {
  const price = Number(product.price)
  const currency = (product.currency || 'usd').toLowerCase()
  const feeBearer = effectiveFeeBearer(product.fee_bearer, product.payment_provider || 'stripe')

  if (feeBearer === 'student' && !split) throw new FeeSplitUnavailableError(product.tenant_id)
  const resolved = splitOrDefault(split)

  const amount = chargedAmount(price, resolved.platformPercentage, feeBearer, currency)
  return {
    price,
    amount,
    currency,
    feeBearer,
    platformPercentage: resolved.platformPercentage,
    schoolPercentage: resolved.schoolPercentage,
    feeIncluded: amount !== price,
  }
}

/**
 * The charge for a product sale. `expectedTenantId` is the tenant the request
 * runs in (x-tenant-id); a product from any other tenant is refused before
 * anything is priced, per the admin-client rule in CLAUDE.md.
 */
export async function resolveProductCharge(
  product: ChargeableProduct,
  opts: { expectedTenantId: string; admin?: SupabaseClient },
): Promise<ProductCharge> {
  if (!product.tenant_id || product.tenant_id !== opts.expectedTenantId) {
    throw new Error('Access denied: product belongs to another tenant')
  }
  const split = await getTenantRevenueSplit(product.tenant_id, opts.admin)
  return computeProductCharge(product, split)
}

/**
 * Do a pending checkout's stored terms still match a freshly computed charge?
 * A leftover row that does not must never be continued — the fee bearer or the
 * split changed while it was open (compared to the minor unit).
 */
export function pendingCheckoutMatches(
  row: { amount: number | string | null; currency: string | null; fee_bearer?: string | null },
  fresh: { amount: number; currency: string; feeBearer: FeeBearer },
): boolean {
  if ((row.currency || '').toLowerCase() !== fresh.currency.toLowerCase()) return false
  if ((row.fee_bearer ?? 'school') !== fresh.feeBearer) return false
  return Math.round(Number(row.amount) * 100) === Math.round(fresh.amount * 100)
}
