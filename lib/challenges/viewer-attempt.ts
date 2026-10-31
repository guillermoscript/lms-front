import type { createAdminClient } from '@/lib/supabase/admin'

export interface ViewerAttempt {
  score: number
  passed: boolean
  /** The viewer's own answer text. Never anyone else's. */
  answer: string
  /** Stored feedback JSON, parsed by the client like a fresh result. */
  feedback: unknown
  createdAt: string
}

/**
 * The viewer's OWN official attempt at this exercise (member by `user_id`,
 * guest by the hash of the signed `reto_guest` cookie), so the page can show
 * "you already played" instead of an empty form. Scoped by tenant and by the
 * viewer's identity only; with no identity it returns `null` without querying.
 */
export async function loadViewerAttempt(
  admin: ReturnType<typeof createAdminClient>,
  tenantId: string,
  exerciseId: number,
  identity: { userId: string | null; guestTokenHash: string | null },
): Promise<ViewerAttempt | null> {
  if (!identity.userId && !identity.guestTokenHash) return null
  let query = admin
    .from('challenge_attempts')
    .select('score, passed, answer, feedback, created_at')
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exerciseId)
    .eq('is_official', true)
  query = identity.userId ? query.eq('user_id', identity.userId) : query.eq('guest_token_hash', identity.guestTokenHash!)
  const { data } = await query.limit(1).maybeSingle()
  if (!data) return null
  const text = (data.answer as { text?: unknown } | null)?.text
  return {
    score: data.score,
    passed: data.passed,
    answer: typeof text === 'string' ? text : '',
    feedback: data.feedback,
    createdAt: data.created_at,
  }
}
