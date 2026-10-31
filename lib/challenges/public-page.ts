import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isChallengesEnabled } from '@/lib/challenges/settings'
import { formatDisplayName } from '@/lib/challenges/ranking'
import { isChallengeableType, isVoiceChallengeType } from '@/lib/challenges/types'
import { parseConversationConfig } from '@/lib/speech/conversation'

export const CHALLENGES_ENABLED_KEY = 'challenges_enabled'


export interface ChallengePageData {
  link: { id: string; token: string; ownerAttemptId: string | null }
  exercise: {
    id: number
    title: string
    instructions: string
    exerciseType: string
    passingScore: number
    /** Voice retos only: the call's time budget in minutes. */
    maxMinutes: number | null
  }
  /** The challenger's official score, when the link carries one. */
  challenger: { score: number; passed: boolean; name: string | null; userId: string | null } | null
  /**
   * Who created the link, as first name + initial (`null` = unknown). Used for
   * OPEN links (no challenger score): "<Name> te reta en <exercise>".
   */
  creatorName: string | null
}

/**
 * Display name for the public surfaces: first name + last initial
 * ("Guille M."). Guests, empty names and anything unusable return `null` so the
 * caller renders the localized "Invitado".
 */
export function displayName(fullName: string | null | undefined): string | null {
  // One rule for every surface (page, OG card, ranking): see formatDisplayName.
  return formatDisplayName(fullName) || null
}

/**
 * Loads everything the public challenge page needs with the admin client
 * (exercises have no anon RLS). Returns `null` — the caller 404s — when the
 * link is unknown, inactive, belongs to another tenant, the school has not
 * opted in, or the exercise is not a published, challengeable text exercise.
 * Answer keys and rubrics are never selected.
 */
export const loadChallengePage = cache(async (token: string, tenantId: string): Promise<ChallengePageData | null> => {
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(token)) return null
  const admin = createAdminClient()

  const [{ data: link }, { data: setting }] = await Promise.all([
    admin
      .from('challenge_links')
      .select('id, token, tenant_id, exercise_id, owner_attempt_id, active, created_by')
      .eq('token', token)
      .maybeSingle(),
    admin
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', CHALLENGES_ENABLED_KEY)
      .maybeSingle(),
  ])
  if (!link || !link.active || link.tenant_id !== tenantId) return null
  if (!isChallengesEnabled(setting?.setting_value)) return null

  const [{ data: exercise }, { data: attempt }, { data: creator }] = await Promise.all([
    admin
      .from('exercises')
      .select('id, title, instructions, exercise_type, exercise_config, is_challengeable, status')
      .eq('id', link.exercise_id)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    link.owner_attempt_id
      ? admin
          .from('challenge_attempts')
          .select('score, passed, user_id')
          .eq('id', link.owner_attempt_id)
          .eq('tenant_id', tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Open link: the creator's name is what the card says (fetched in parallel).
    !link.owner_attempt_id && link.created_by
      ? admin.from('profiles').select('full_name').eq('id', link.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!exercise || !exercise.is_challengeable || exercise.status !== 'published') return null
  if (!isChallengeableType(exercise.exercise_type)) return null

  const config = (exercise.exercise_config ?? {}) as { passing_score?: unknown }
  const passingScore = typeof config.passing_score === 'number' ? config.passing_score : 70

  let challenger: ChallengePageData['challenger'] = null
  if (attempt) {
    let name: string | null = null
    if (attempt.user_id) {
      const { data: profile } = await admin.from('profiles').select('full_name').eq('id', attempt.user_id).maybeSingle()
      name = displayName(profile?.full_name)
    }
    challenger = { score: attempt.score, passed: attempt.passed, name, userId: attempt.user_id }
  }

  const creatorName: string | null = challenger?.name ?? displayName((creator as { full_name?: string | null } | null)?.full_name)

  return {
    link: { id: link.id, token: link.token, ownerAttemptId: link.owner_attempt_id },
    exercise: {
      id: exercise.id,
      title: exercise.title,
      instructions: exercise.instructions,
      exerciseType: exercise.exercise_type,
      passingScore,
      maxMinutes: isVoiceChallengeType(exercise.exercise_type)
        ? parseConversationConfig(exercise.exercise_config).max_minutes
        : null,
    },
    challenger,
    creatorName,
  }
})

/** Same gating as the page, one name for both callers (page + OG card). */
export const loadPublicChallenge = loadChallengePage
