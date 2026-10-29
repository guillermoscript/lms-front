/**
 * Parses `tenant_settings.challenges_enabled`. The admin UI writes
 * `{enabled: true}`; older/raw rows may hold `true` or `'true'`. Anything else
 * (missing, false, other shapes) is OFF.
 */
export function isChallengesEnabled(raw: unknown): boolean {
  if (raw === true || raw === 'true') return true
  if (raw && typeof raw === 'object') {
    const enabled = (raw as { enabled?: unknown }).enabled
    return enabled === true || enabled === 'true'
  }
  return false
}
