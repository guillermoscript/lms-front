/**
 * Parses `tenant_settings.challenges_enabled`. The admin UI writes
 * `{enabled: true}`; older/raw rows may hold `true` or `'true'`. Anything else
 * (missing, false, other shapes) is OFF.
 */
export function isChallengesEnabled(raw: unknown): boolean {
  if (raw === true || raw === 'true') return true
  if (raw && typeof raw === 'object') return (raw as { enabled?: unknown }).enabled === true
  return false
}

/** Monthly guest cap used when the school has not configured one. */
export const DEFAULT_GUEST_MONTHLY_CAP = 200

/**
 * `tenant_settings.challenges_groups_enabled` (#1050). Unlike `challenges_enabled`
 * this is opt-OUT: a missing row means ON (groups also need challenges on), an
 * explicit `false` / `{enabled:false}` switches friend groups off for the school.
 */
export function isGroupsEnabled(raw: unknown): boolean {
  if (raw === undefined || raw === null) return true
  if (raw === false || raw === 'false') return false
  if (typeof raw === 'object') return (raw as { enabled?: unknown }).enabled !== false
  return true
}
