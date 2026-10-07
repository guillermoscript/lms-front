import type { SupabaseClient } from '@supabase/supabase-js'
import { handleAiError, type HandleAiErrorOptions } from '@/lib/ai/errors'

/**
 * Catch-block helper for the exercise grading routes. AI / provider failures
 * become the typed JSON response (402/424/422/429/502, key auto-invalidated on
 * a rejected key); anything else (a malformed grader answer, a bug) keeps the
 * route's own generic failure response instead of escaping as an unhandled throw.
 */
export async function aiFailureResponse(
  err: unknown,
  options: HandleAiErrorOptions,
  fallback: () => Response,
): Promise<Response> {
  try {
    return await handleAiError(err, options)
  } catch {
    // Name only: a provider/DB message can carry a key fragment or prompt text.
    console.error('[exercise-ai]', options.feature, err instanceof Error ? err.name : typeof err)
    return fallback()
  }
}

/**
 * Is the caller a school admin (decides the error copy and the settings link)?
 * tenant_users is the authoritative source; `x-user-id` does not reach route
 * handlers. Fails closed to "not an admin".
 */
export async function canConfigureAi(
  supabase: Pick<SupabaseClient, 'from'>,
  userId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  return data?.role === 'admin'
}
