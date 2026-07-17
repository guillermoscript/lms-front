import { createClient } from '@/lib/supabase/server'

export const EMAIL_NOT_VERIFIED_ERROR =
  'Please verify your email address to use this feature. Check your inbox for the confirmation link.'

/**
 * Whether the current user's email is confirmed. Email verification is async
 * (issue #436): signup never blocks on it, but sensitive actions — sending
 * invitations, connecting Stripe payouts — require a verified email.
 */
export async function isEmailVerified(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return Boolean(user?.email_confirmed_at)
}
