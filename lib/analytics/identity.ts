/**
 * Pure helpers for binding an analytics session to the signed-in user.
 *
 * Kept free of React, Supabase and `@openpanel/*` so the unit tests can pin
 * them without mocking a browser. Consumed by
 * `components/analytics-user-binder.tsx`.
 */

export type AnalyticsUserTraits = {
  firstName?: string
  lastName?: string
  email?: string
  avatar?: string
}

/**
 * `profiles.full_name` (and `user_metadata.full_name`) is one free-text field;
 * OpenPanel's profile has `firstName` / `lastName`. First token becomes the
 * first name, the rest the last name, so "María José Pérez" renders as
 * "María José Pérez" in the sessions list rather than being dropped.
 */
export function splitFullName(
  fullName: string | null | undefined
): Pick<AnalyticsUserTraits, 'firstName' | 'lastName'> {
  const trimmed = (fullName ?? '').trim().replace(/\s+/g, ' ')
  if (!trimmed) return {}
  const [firstName, ...rest] = trimmed.split(' ')
  return rest.length ? { firstName, lastName: rest.join(' ') } : { firstName }
}

/**
 * Minimal shape of what we read off a Supabase session. Typed structurally so
 * the binder can hand over `session.user` without an import cycle.
 */
export type SessionUserLike = {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}

/** Traits for `identify()`. No property is ever invented: absent stays absent. */
export function traitsFromSessionUser(user: SessionUserLike): AnalyticsUserTraits {
  const meta = user.user_metadata ?? {}
  const fullName = typeof meta.full_name === 'string' ? meta.full_name : undefined
  const avatar = typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined
  return {
    ...splitFullName(fullName),
    ...(user.email ? { email: user.email } : {}),
    ...(avatar ? { avatar } : {}),
  }
}

/**
 * Role claims from the JWT, without a network call. `tenant_role` is the
 * role in the current school; `user_role` the global one. Both are optional
 * claims written by `custom_access_token_hook()`.
 */
export function rolesFromAccessToken(
  accessToken: string | null | undefined
): { tenant_role?: string; user_role?: string } {
  if (!accessToken) return {}
  try {
    const [, payload] = accessToken.split('.')
    if (!payload) return {}
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8')
    ) as Record<string, unknown>
    return {
      ...(typeof json.tenant_role === 'string' ? { tenant_role: json.tenant_role } : {}),
      ...(typeof json.user_role === 'string' ? { user_role: json.user_role } : {}),
    }
  } catch {
    return {}
  }
}
