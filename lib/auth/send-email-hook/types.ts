/**
 * Payload shape for Supabase Auth's "Send Email" hook (issue #776).
 *
 * Once the hook is enabled in the hosted project, GoTrue stops composing and
 * sending its own templated emails for sign-up confirmation, magic link,
 * recovery and invite — it POSTs this payload to our HTTP endpoint instead
 * and expects us to deliver the email ourselves.
 *
 * https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook
 */

/** The five action types this app renders a branded email for. */
export type SendEmailActionType =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'reauthentication'
  | (string & {})

export interface SendEmailHookUser {
  id: string
  email: string
  /** Present only during an email-change flow (`email_data.email_action_type === 'email_change'`). */
  new_email?: string
  user_metadata?: Record<string, unknown> | null
}

export interface SendEmailHookEmailData {
  /** 6-digit OTP — unused here, the link uses `token_hash` instead. */
  token: string
  token_hash: string
  redirect_to: string
  email_action_type: SendEmailActionType
  /** The project's global Site URL setting — NOT tenant-aware. See `build-link.ts`. */
  site_url: string
  /**
   * Email-change only. Field names are reversed from what they look like:
   * `token_hash` pairs with `user.new_email`, `token_hash_new` pairs with
   * `user.email` (the CURRENT address) — a documented GoTrue quirk
   * (github.com/supabase/auth#1744). See the route handler.
   */
  token_new?: string
  token_hash_new?: string
}

export interface SendEmailHookPayload {
  user: SendEmailHookUser
  email_data: SendEmailHookEmailData
}

/** Narrows an already-verified webhook body to the fields this route relies on. */
export function isSendEmailHookPayload(value: unknown): value is SendEmailHookPayload {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  const user = v.user as Record<string, unknown> | undefined
  const emailData = v.email_data as Record<string, unknown> | undefined
  return (
    !!user &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    !!emailData &&
    typeof emailData.token_hash === 'string' &&
    typeof emailData.email_action_type === 'string' &&
    typeof emailData.site_url === 'string' &&
    typeof emailData.redirect_to === 'string'
  )
}
