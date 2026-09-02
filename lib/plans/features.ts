export interface PlanFeatures {
  leaderboard: boolean
  achievements: boolean
  store: boolean
  certificates: 'basic' | 'custom' | boolean
  analytics: 'basic' | 'advanced' | boolean
  ai_grading: boolean
  custom_branding: boolean
  custom_domain: boolean
  api_access: boolean
  white_label: boolean
  priority_support: boolean
  xp: boolean
  levels: boolean
  streaks: boolean
  landing_pages: boolean
  remove_branding: boolean
  voice_exercises: boolean
  community: boolean
}

export interface PlanLimits {
  max_courses: number  // -1 = unlimited
  max_students: number // -1 = unlimited
}

export interface PlanInfo {
  plan: string
  plan_name: string
  features: PlanFeatures
  limits: PlanLimits
  transaction_fee_percent: number
}

/**
 * Which plan is needed to unlock a given feature — the pricing promise.
 *
 * Every key here is enforced on the server (issue #662): either through
 * `requirePlanFeature()` / `hasPlanFeature()` in lib/plans/server.ts, or by the
 * database / edge functions for the gamification keys. A contract test
 * (tests/unit/plan-feature-gate-contract.test.ts) fails the build when a key is
 * added here without a gate site, so a feature cannot be sold and not enforced.
 *
 * `api_access` was removed 2026-09-01: the MCP server stays open on every plan
 * (role-gated only), so it is no longer something a plan unlocks.
 */
export const FEATURE_REQUIRED_PLAN: Record<string, string> = {
  leaderboard: 'starter',
  achievements: 'starter',
  analytics: 'starter',
  community: 'starter',
  store: 'pro',
  ai_grading: 'pro',
  voice_exercises: 'pro',
  remove_branding: 'pro',
  custom_branding: 'business',
  custom_domain: 'business',
  priority_support: 'business',
  white_label: 'enterprise',
}

/**
 * Canonical feature list for every comparison surface (public pricing table,
 * admin plan comparison, upgrade nudge). One list so the pricing page, the
 * upgrade page and the nudge can never disagree about what a plan includes.
 * Labels are the English fallback; `messages/*.json` `featureGate.features.*`
 * carries the translations.
 */
export const PLAN_FEATURE_LABELS: Record<string, string> = {
  leaderboard: 'Leaderboard',
  achievements: 'Achievements',
  store: 'Point Store',
  community: 'Community',
  certificates: 'Certificates',
  analytics: 'Analytics',
  ai_grading: 'AI Auto-Grading',
  voice_exercises: 'Voice Exercises',
  remove_branding: 'Remove "Powered by" branding',
  custom_branding: 'Custom Branding',
  custom_domain: 'Custom Domain',
  white_label: 'White-Label',
  priority_support: 'Priority Support',
}

export const PLAN_FEATURE_KEYS = Object.keys(PLAN_FEATURE_LABELS)

/**
 * Plan display prices (monthly) for upgrade nudges
 */
export const PLAN_PRICES: Record<string, number> = {
  free: 0,
  starter: 9,
  pro: 29,
  business: 79,
  enterprise: 199,
}

/**
 * Check if a feature is available in the current plan
 */
export function canAccessFeature(features: Partial<PlanFeatures>, featureName: keyof PlanFeatures): boolean {
  const value = features[featureName]
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return true
  return false
}

/**
 * Check if a usage limit has been reached
 * @param current - Current usage count
 * @param limit - Max allowed (-1 = unlimited)
 */
export function isAtLimit(current: number, limit: number): boolean {
  if (limit === -1) return false
  return current >= limit
}

/**
 * Check if approaching limit (80%+)
 */
export function isApproachingLimit(current: number, limit: number): boolean {
  if (limit === -1) return false
  return current >= limit * 0.8
}

/**
 * Get plan features from the server via edge function.
 * For server components, prefer calling the DB function directly.
 */
export async function fetchPlanFeatures(
  supabaseUrl: string,
  accessToken: string,
  tenantId?: string
): Promise<PlanInfo | null> {
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/get-plan-features`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: tenantId ? JSON.stringify({ tenant_id: tenantId }) : '{}',
    })

    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}
