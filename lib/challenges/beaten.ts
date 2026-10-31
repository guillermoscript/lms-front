import type { SupabaseClient } from '@supabase/supabase-js'
import { getTranslations } from 'next-intl/server'
import { resolveTenantLocale } from '@/lib/i18n/tenant-locale'
import { writeUserNotification } from '@/lib/notifications/member-notice'
import { formatDisplayName } from '@/lib/challenges/ranking'
import { memberChallengePath } from '@/lib/challenges/routes'

/** `metadata.kind` of the in-app notification (also what the throttle keys on). */
export const CHALLENGE_BEATEN_KIND = 'challengeBeaten'
/** At most one "you were beaten" notification per owner + exercise in this window. */
export const BEATEN_THROTTLE_MS = 24 * 60 * 60 * 1000

/**
 * Re-engagement (F5): a new OFFICIAL attempt that scores strictly higher than the
 * official score of a link owner tells that owner, in-app (the user_notifications
 * row also feeds the existing push sweep, which honours push opt-outs).
 *
 * Best-effort: never throws, so it can never fail the attempt or the claim. It
 * reuses the existing `info` notification type (kind lives in metadata), so no
 * schema change is needed; if the insert is rejected it is logged and skipped.
 * Returns how many owners were notified.
 */
export async function notifyChallengeBeaten(params: {
  admin: SupabaseClient
  tenantId: string
  /** The attempt that was just persisted as official (member or claimed guest). */
  attemptId: string
  now?: Date
}): Promise<number> {
  const { admin, tenantId, attemptId } = params
  const now = params.now ?? new Date()
  try {
    const { data: attempt } = await admin
      .from('challenge_attempts')
      .select('id, user_id, exercise_id, score, is_official')
      .eq('id', attemptId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    // Unclaimed guests have no profile to name and no account to compare; official only.
    if (!attempt || !attempt.is_official || !attempt.user_id) return 0
    const beaterId = attempt.user_id as string
    const exerciseId = attempt.exercise_id as number

    const { data: links } = await admin
      .from('challenge_links')
      .select('id, token, created_by, owner_attempt_id')
      .eq('tenant_id', tenantId)
      .eq('exercise_id', exerciseId)
      .eq('active', true)
    const withOwner = (links ?? []).filter((l) => l.owner_attempt_id)
    if (withOwner.length === 0) return 0

    // Distinct owners (one notification each), keyed by owner user id.
    const owners = new Map<string, { token: string }>()
    for (const link of withOwner) {
      const { data: ownerAttempt } = await admin
        .from('challenge_attempts')
        .select('user_id, score, is_official')
        .eq('id', link.owner_attempt_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      const ownerId = ownerAttempt?.user_id as string | null | undefined
      if (!ownerAttempt || !ownerId || ownerAttempt.is_official !== true) continue
      if (ownerId === beaterId) continue // never notify yourself
      if (!(attempt.score > (ownerAttempt.score as number))) continue // strictly higher only
      if (!owners.has(ownerId)) owners.set(ownerId, { token: link.token as string })
    }
    if (owners.size === 0) return 0

    const { data: exercise } = await admin
      .from('exercises')
      .select('title')
      .eq('id', exerciseId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', beaterId).maybeSingle()

    const locale = await resolveTenantLocale(admin, tenantId)
    const t = await getTranslations({ locale, namespace: 'challenges.notifyBeaten' })
    const name = formatDisplayName(profile?.full_name) || t('friend')
    const title = (exercise?.title as string | undefined) ?? ''

    let sent = 0
    for (const [ownerId, { token }] of owners) {
      if (await alreadyNotified(admin, tenantId, ownerId, exerciseId, attemptId, now)) continue
      const ok = await writeUserNotification({
        admin,
        tenantId,
        userId: ownerId,
        title: t('title'),
        content: t('content', { name, exercise: title }),
        type: 'info',
        kind: CHALLENGE_BEATEN_KIND,
        link: memberChallengePath(token),
        extraMetadata: { exercise_id: exerciseId, beater_attempt_id: attemptId },
      })
      if (ok) sent += 1
    }
    return sent
  } catch (err) {
    console.error('notifyChallengeBeaten failed (non-fatal):', err instanceof Error ? err.message : err)
    return 0
  }
}

/** Idempotent per beater attempt, and throttled to one per owner + exercise per 24h. */
async function alreadyNotified(
  admin: SupabaseClient,
  tenantId: string,
  ownerId: string,
  exerciseId: number,
  attemptId: string,
  now: Date
): Promise<boolean> {
  const { data, error } = await admin
    .from('notifications')
    .select('created_at, metadata')
    .eq('tenant_id', tenantId)
    .contains('target_user_ids', [ownerId])
    .contains('metadata', { kind: CHALLENGE_BEATEN_KIND, exercise_id: exerciseId })
    .order('created_at', { ascending: false })
    .limit(50)
  // Cannot prove we have not already told them: skip rather than risk spamming.
  if (error) {
    console.error('notifyChallengeBeaten dedupe lookup failed:', error.message)
    return true
  }
  const cutoff = now.getTime() - BEATEN_THROTTLE_MS
  return (data ?? []).some((n) => {
    const meta = (n.metadata ?? {}) as { beater_attempt_id?: string }
    return meta.beater_attempt_id === attemptId || new Date(n.created_at as string).getTime() > cutoff
  })
}
