/**
 * Server-side plan feature gates (issue #662).
 *
 * `platform_plans.features` is what the pricing page sells; until #662 it was
 * enforced by `usePlanFeatures()` in the browser and by bespoke `if` blocks on
 * a handful of pages, never at the action or route that does the work. This
 * module is the one place the server asks "may this tenant use X?".
 *
 * Data path: `tenants.plan` → `platform_plans` by slug, read with the
 * service-role client and deliberately WITHOUT the `is_active` filter — the
 * same rule `getTenantPlanLimits()` follows (retiring a plan must not change
 * what its subscribers may do). Note this differs from the `get_plan_features`
 * RPC, which filters on `is_active`; the RPC stays for the client hook.
 *
 * Defaults are closed: a tenant with no plan row, or a plan without the key,
 * does NOT have the feature. `20260901170000_backfill_plan_feature_keys.sql`
 * makes sure every key the app gates on exists on every plan, so "closed" only
 * ever bites a genuinely unknown key.
 *
 * `getTenantPlan` is wrapped in React `cache()` so a request that gates three
 * things (layout branding, a page, an action) pays for one read.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { FEATURE_REQUIRED_PLAN, type PlanFeatures } from '@/lib/plans/features'

export type PlanFeatureKey = keyof PlanFeatures

export type AnalyticsTier = 'none' | 'basic' | 'advanced'
export type CertificateTier = 'none' | 'basic' | 'custom'

export interface TenantPlan {
  /** Plan slug (`free` when the tenant row has no plan). */
  slug: string
  name: string | null
  /** Raw feature JSON; values are booleans except `analytics` / `certificates`. */
  features: Partial<Record<PlanFeatureKey, boolean | string>>
}

const FREE: TenantPlan = { slug: 'free', name: null, features: {} }

/**
 * The tenant's current plan and feature JSON. One read per request.
 */
export const getTenantPlan = cache(async (tenantId: string): Promise<TenantPlan> => {
  const admin = createAdminClient()

  const { data: tenant } = await admin.from('tenants').select('plan').eq('id', tenantId).maybeSingle()
  const slug = (tenant?.plan as string | null) || 'free'

  const { data: plan } = await admin
    .from('platform_plans')
    .select('name, features')
    .eq('slug', slug)
    .maybeSingle()

  if (!plan) return { ...FREE, slug }

  const features =
    plan.features && typeof plan.features === 'object' && !Array.isArray(plan.features)
      ? (plan.features as TenantPlan['features'])
      : {}

  return { slug, name: (plan.name as string | null) ?? null, features }
})

/**
 * `true` when the plan includes the feature. A string value counts as included
 * unless it is `"false"` (the `analytics` / `certificates` tiers are strings).
 */
export function planIncludes(plan: TenantPlan, feature: PlanFeatureKey): boolean {
  const value = plan.features[feature]
  if (value === true) return true
  if (typeof value === 'string') return value !== '' && value !== 'false'
  return false
}

export async function hasPlanFeature(tenantId: string, feature: PlanFeatureKey): Promise<boolean> {
  return planIncludes(await getTenantPlan(tenantId), feature)
}

export function analyticsTierOf(plan: TenantPlan): AnalyticsTier {
  const value = plan.features.analytics
  if (value === 'advanced') return 'advanced'
  if (value === 'basic' || value === true) return 'basic'
  return 'none'
}

export async function getAnalyticsTier(tenantId: string): Promise<AnalyticsTier> {
  return analyticsTierOf(await getTenantPlan(tenantId))
}

export function certificateTierOf(plan: TenantPlan): CertificateTier {
  const value = plan.features.certificates
  if (value === 'custom' || value === true) return 'custom'
  if (value === 'basic') return 'basic'
  return 'none'
}

export async function getCertificateTier(tenantId: string): Promise<CertificateTier> {
  return certificateTierOf(await getTenantPlan(tenantId))
}

/**
 * Thrown by `requirePlanFeature`. Carries enough for the caller to render the
 * same upgrade nudge the UI shows, or to return an `ActionResult`.
 */
export class PlanFeatureError extends Error {
  readonly code = 'PLAN_FEATURE_REQUIRED' as const
  constructor(
    readonly feature: PlanFeatureKey,
    readonly currentPlan: string,
    readonly requiredPlan: string
  ) {
    super(`plan_feature_required:${feature}`)
    this.name = 'PlanFeatureError'
  }
}

export function isPlanFeatureError(err: unknown): err is PlanFeatureError {
  return err instanceof PlanFeatureError || (!!err && typeof err === 'object' && (err as { code?: unknown }).code === 'PLAN_FEATURE_REQUIRED')
}

/**
 * Refuse unless the tenant's plan includes `feature`. Use at the top of any
 * server action / route handler that does the gated work — the UI nudge is a
 * courtesy, this is the enforcement.
 */
export async function requirePlanFeature(tenantId: string, feature: PlanFeatureKey): Promise<TenantPlan> {
  const plan = await getTenantPlan(tenantId)
  if (!planIncludes(plan, feature)) {
    throw new PlanFeatureError(feature, plan.slug, FEATURE_REQUIRED_PLAN[feature] ?? 'starter')
  }
  return plan
}

/** Human-readable refusal for `ActionResult`-style callers. */
export function planFeatureErrorMessage(err: PlanFeatureError): string {
  const plan = err.requiredPlan.charAt(0).toUpperCase() + err.requiredPlan.slice(1)
  return `This feature requires the ${plan} plan or higher. Upgrade your plan to unlock it.`
}
