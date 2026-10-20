import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBillingMode, type BillingMode } from './billing-mode'

/**
 * THE effective platform fee. Every site that needs "what % of a student sale does the
 * platform keep for this school" goes through here (checkout, split snapshot, earnings,
 * ledger). The SQL twin is `public.effective_school_percentage(tenant_id)`; keep them identical.
 *
 *   internal -> 0
 *   comped   -> fee_percent_override ?? 0
 *   paid     -> the plan's rate as stored in revenue_splits (100 - school_percentage)
 */
export const DEFAULT_PAID_PLATFORM_FEE_PERCENT = 20

export interface EffectiveFeeInput {
  billingMode: BillingMode | string | null | undefined
  feePercentOverride?: number | string | null
  /** Platform % from revenue_splits for `paid` tenants (null/undefined = no row). */
  paidPlatformPercent?: number | null
}

export function effectivePlatformFeePercent(input: EffectiveFeeInput): number {
  const mode = normalizeBillingMode(input.billingMode)
  if (mode === 'internal') return 0
  if (mode === 'comped') {
    const o = input.feePercentOverride == null ? 0 : Number(input.feePercentOverride)
    return Number.isFinite(o) ? Math.min(100, Math.max(0, o)) : 0
  }
  const p = input.paidPlatformPercent
  return p == null || !Number.isFinite(p) ? DEFAULT_PAID_PLATFORM_FEE_PERCENT : p
}

export function effectiveSchoolPercentage(input: EffectiveFeeInput): number {
  return 100 - effectivePlatformFeePercent(input)
}

export interface EffectiveRevenueSplit {
  billingMode: BillingMode
  platformPercentage: number
  schoolPercentage: number
}

/** Loads tenants.billing_mode/fee_percent_override + revenue_splits and applies the rule. */
export async function getEffectiveRevenueSplit(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<EffectiveRevenueSplit> {
  const [{ data: tenant }, { data: split }] = await Promise.all([
    supabase.from('tenants').select('billing_mode, fee_percent_override').eq('id', tenantId).maybeSingle(),
    supabase.from('revenue_splits').select('platform_percentage, school_percentage').eq('tenant_id', tenantId).maybeSingle(),
  ])
  const t = tenant as { billing_mode?: string | null; fee_percent_override?: number | string | null } | null
  const s = split as { platform_percentage?: number | null; school_percentage?: number | null } | null
  const paidPlatform =
    s?.school_percentage != null ? 100 - Number(s.school_percentage) : s?.platform_percentage ?? null
  const input: EffectiveFeeInput = {
    billingMode: t?.billing_mode,
    feePercentOverride: t?.fee_percent_override,
    paidPlatformPercent: paidPlatform == null ? null : Number(paidPlatform),
  }
  return {
    billingMode: normalizeBillingMode(t?.billing_mode),
    platformPercentage: effectivePlatformFeePercent(input),
    schoolPercentage: effectiveSchoolPercentage(input),
  }
}
