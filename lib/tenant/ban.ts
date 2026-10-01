/**
 * Tenant bans (#892).
 *
 * `tenant_users.status = 'banned'` is enforced by the `guard_tenant_ban`
 * trigger (migration `20261001160000_tenant_ban_892.sql`), which raises SQLSTATE
 * `LM002` / message `tenant_banned` on any write that would move a banned row
 * out of `banned` other than `lift_tenant_ban()`. Map it with
 * `isTenantBannedError()`, never by matching the message.
 */

export const TENANT_BANNED_SQLSTATE = 'LM002'

export const MAX_BAN_REASON_LENGTH = 500

export function isTenantBannedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const { code, message } = err as { code?: unknown; message?: unknown }
  return (
    code === TENANT_BANNED_SQLSTATE ||
    (typeof message === 'string' && message.includes('tenant_banned'))
  )
}

/** Trim; empty or whitespace-only becomes `null`; capped at the max length. */
export function normalizeBanReason(reason: string | null | undefined): string | null {
  const trimmed = (reason ?? '').trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_BAN_REASON_LENGTH)
}
