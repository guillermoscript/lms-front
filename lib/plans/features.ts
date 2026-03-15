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
 * Which plan is needed to unlock a given feature.
 * Used for upgrade nudges.
 */
export const FEATURE_REQUIRED_PLAN: Record<string, string> = {
  leaderboard: 'starter',
  achievements: 'starter',
  analytics: 'starter',
  landing_pages: 'starter',
  community: 'starter',
  store: 'pro',
  ai_grading: 'pro',
  voice_exercises: 'pro',
  remove_branding: 'pro',
  custom_branding: 'business',
  custom_domain: 'business',
  priority_support: 'business',
  api_access: 'enterprise',
  white_label: 'enterprise',
}

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
