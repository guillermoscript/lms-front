import type { SupabaseClient } from '@supabase/supabase-js'
import {
  CONVERSATION_OVERRUN_SLACK_SECONDS,
  CONVERSATION_TAB_KEY,
  conversationOverran,
  parseConversationConfig,
  type ConversationTurn,
} from '@/lib/speech/conversation'

/**
 * Voice-reto sessions (a reto on a `real_time_conversation` exercise).
 *
 * The realtime socket is browser ↔ provider, so the server never hears the
 * call: the transcript is the browser's word. What the server CAN do is accept
 * a transcript only against a session it opened (the token route), once, within
 * the teacher's time budget, and plausible for its length. Sessions reuse
 * `exercise_media_submissions` (`media_type = 'conversation'`) like the normal
 * voice exercise, tagged `stt_result.source = 'challenge'` so the normal
 * route's pending-session cleanup never touches them and the hourly cap below
 * can count them. The transcript itself is NEVER stored here: it lives only on
 * the member's own `challenge_attempts.answer`.
 *
 * Admin client, explicit `tenant_id` on every query.
 */

export const VOICE_SESSION_SOURCE = 'challenge'

/** Minted voice sessions per member per rolling hour, graded or not (the minutes are billed either way). */
export const VOICE_HOURLY_SESSION_CAP = 5

const HOUR_MS = 60 * 60 * 1000

export type VoiceClaim =
  | { ok: true; sessionId: string; durationSeconds: number | null }
  | { ok: false; reason: 'no_session' | 'session_too_long' | 'invalid_transcript' }

export interface VoiceSessionKey {
  tenantId: string
  userId: string
  exerciseId: number
  tab: string
}

export function isValidTab(tab: unknown): tab is string {
  return typeof tab === 'string' && CONVERSATION_TAB_KEY.test(tab)
}

/** Opens a session for the token route. `rate_limited` when the member minted too many this hour. */
export async function openVoiceSession(
  admin: SupabaseClient,
  key: VoiceSessionKey,
  exerciseConfig: unknown
): Promise<{ ok: true; sessionId: string } | { ok: false; reason: 'rate_limited' | 'failed' }> {
  const now = Date.now()
  const { count, error: countError } = await admin
    .from('exercise_media_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', key.tenantId)
    .eq('user_id', key.userId)
    .eq('media_type', 'conversation')
    .eq('stt_result->>source', VOICE_SESSION_SOURCE)
    .gte('created_at', new Date(now - HOUR_MS).toISOString())
  // Fail closed: an unreadable count must not become unlimited minutes.
  if (countError) return { ok: false, reason: 'failed' }
  if ((count ?? 0) >= VOICE_HOURLY_SESSION_CAP) return { ok: false, reason: 'rate_limited' }

  // Same-tab restart abandons the previous call; whatever outlived its budget can no longer be graded.
  const mine = () =>
    admin
      .from('exercise_media_submissions')
      .update({ status: 'failed' })
      .eq('tenant_id', key.tenantId)
      .eq('exercise_id', key.exerciseId)
      .eq('user_id', key.userId)
      .eq('media_type', 'conversation')
      .eq('status', 'pending')
      .eq('stt_result->>source', VOICE_SESSION_SOURCE)
  await mine().eq('stt_result->>tab', key.tab)
  const budgetMs = (parseConversationConfig(exerciseConfig).max_minutes * 60 + CONVERSATION_OVERRUN_SLACK_SECONDS) * 1000
  await mine().lt('created_at', new Date(now - budgetMs).toISOString())

  const { data, error } = await admin
    .from('exercise_media_submissions')
    .insert({
      exercise_id: key.exerciseId,
      user_id: key.userId,
      tenant_id: key.tenantId,
      media_type: 'conversation',
      media_url: '',
      status: 'pending',
      stt_result: { tab: key.tab, source: VOICE_SESSION_SOURCE },
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, reason: 'failed' }
  return { ok: true, sessionId: data.id as string }
}

/** The mint failed after the row was written: release it so the member loses no session. */
export async function discardVoiceSession(admin: SupabaseClient, tenantId: string, userId: string, sessionId: string) {
  await admin.from('exercise_media_submissions').delete().eq('id', sessionId).eq('tenant_id', tenantId).eq('user_id', userId)
}

/**
 * Claims the member's open session for this tab (pending → processing) and
 * checks the transcript against it. Over-time and impossible transcripts burn
 * the session (`failed`); a missing one is just `no_session`.
 */
export async function claimVoiceSession(
  admin: SupabaseClient,
  key: VoiceSessionKey,
  exerciseConfig: unknown,
  transcript: ConversationTurn[]
): Promise<VoiceClaim> {
  const { data: session } = await admin
    .from('exercise_media_submissions')
    .select('id, created_at, duration_seconds')
    .eq('tenant_id', key.tenantId)
    .eq('exercise_id', key.exerciseId)
    .eq('user_id', key.userId)
    .eq('media_type', 'conversation')
    .eq('status', 'pending')
    .eq('stt_result->>source', VOICE_SESSION_SOURCE)
    .eq('stt_result->>tab', key.tab)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!session) return { ok: false, reason: 'no_session' }

  // Stamped by the first claim: a retry is not measured against time we spent grading.
  const durationSeconds: number | null =
    (session.duration_seconds as number | null) ??
    (session.created_at ? Math.max(0, Math.round((Date.now() - new Date(session.created_at as string).getTime()) / 1000)) : null)

  const { data: claimed } = await admin
    .from('exercise_media_submissions')
    .update({ status: 'processing', duration_seconds: durationSeconds })
    .eq('id', session.id)
    .eq('tenant_id', key.tenantId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!claimed) return { ok: false, reason: 'no_session' }

  const config = parseConversationConfig(exerciseConfig)
  const studentWords = transcript.filter((t) => t.role === 'user').reduce((n, t) => n + t.text.split(/\s+/).length, 0)
  const fail = async (reason: 'session_too_long' | 'invalid_transcript'): Promise<VoiceClaim> => {
    await settleVoiceSession(admin, key.tenantId, session.id as string, 'failed')
    return { ok: false, reason }
  }
  if (durationSeconds != null && conversationOverran(durationSeconds, config.max_minutes)) return fail('session_too_long')
  // Nobody speaks faster than ~4 words a second: a long transcript seconds after the session opened was not spoken.
  if (durationSeconds != null && studentWords > 20 && studentWords > durationSeconds * 4) return fail('invalid_transcript')
  // Nothing the student said: nothing to rank (and nothing worth a grading call).
  if (studentWords === 0) return fail('invalid_transcript')

  return { ok: true, sessionId: session.id as string, durationSeconds }
}

/** `pending` re-opens the session for a retry (grader failure, rate limit); `completed`/`failed` close it. */
export async function settleVoiceSession(
  admin: SupabaseClient,
  tenantId: string,
  sessionId: string,
  status: 'pending' | 'completed' | 'failed'
) {
  await admin.from('exercise_media_submissions').update({ status }).eq('id', sessionId).eq('tenant_id', tenantId)
}
