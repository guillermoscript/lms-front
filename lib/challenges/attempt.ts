import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/database.types'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { isChallengeableType, type ChallengeGrade, type ChallengeGradingExercise } from '@/lib/challenges/grade'
import { checkChallengeLimits } from '@/lib/challenges/limits'

export const MAX_ANSWER_CHARS = 20_000

export type AttemptRefusal =
  | 'link_not_found'
  | 'tenant_mismatch'
  | 'link_inactive'
  | 'challenges_disabled'
  | 'exercise_unavailable'
  | 'plan_feature_required'
  | 'rate_limited'
  | 'paused'

export interface AttemptIdentity {
  userId: string | null
  guestTokenHash: string | null
  ipHash: string
}

export interface AttemptResult {
  attemptId: string
  score: number
  passed: boolean
  passingScore: number
  feedback: string
  strengths: string[]
  improvements: string[]
  isOfficial: boolean
  /** True when a stored grade was returned instead of grading again. */
  alreadyGraded: boolean
}

export type AttemptOutcome = { ok: true; result: AttemptResult } | { ok: false; refusal: AttemptRefusal }

export interface AttemptDeps {
  admin: SupabaseClient
  /** Tenant resolved from the request host. */
  hostTenantId: string
  hasAiGrading: (tenantId: string) => Promise<boolean>
  /** Resolves the school's grader and grades. Called only when a fresh grade is needed. */
  grade: (exercise: ChallengeGradingExercise, answer: string) => Promise<ChallengeGrade>
}

interface StoredFeedback {
  feedback?: string
  strengths?: string[]
  improvements?: string[]
  passing_score?: number
}

function challengesEnabled(value: unknown): boolean {
  if (value === true) return true
  return !!value && typeof value === 'object' && (value as { enabled?: unknown }).enabled === true
}

function fromRow(
  row: { id: string; score: number; passed: boolean; feedback: Json | null; is_official: boolean },
  fallbackPassingScore: number,
  alreadyGraded: boolean
): AttemptResult {
  const fb = (row.feedback && typeof row.feedback === 'object' && !Array.isArray(row.feedback)
    ? row.feedback
    : {}) as StoredFeedback
  return {
    attemptId: row.id,
    score: row.score,
    passed: row.passed,
    passingScore: typeof fb.passing_score === 'number' ? fb.passing_score : fallbackPassingScore,
    feedback: fb.feedback ?? '',
    strengths: fb.strengths ?? [],
    improvements: fb.improvements ?? [],
    isOfficial: row.is_official,
    alreadyGraded,
  }
}

/**
 * One challenge attempt: validate, grade once, persist. Never writes
 * `exercise_completions` / `exercise_evaluations`, never returns answer keys.
 */
export async function submitChallengeAttempt(
  deps: AttemptDeps,
  input: { token: string; answer: string },
  identity: AttemptIdentity
): Promise<AttemptOutcome> {
  const { admin, hostTenantId } = deps
  const refuse = (refusal: AttemptRefusal): AttemptOutcome => ({ ok: false, refusal })

  const { data: link } = await admin
    .from('challenge_links')
    .select('id, tenant_id, exercise_id, active')
    .eq('token', input.token)
    .maybeSingle()
  if (!link) return refuse('link_not_found')
  // A link only works on its own school's host; never reveal it exists elsewhere.
  if (link.tenant_id !== hostTenantId) return refuse('tenant_mismatch')
  if (!link.active) return refuse('link_inactive')
  const tenantId = link.tenant_id as string

  const { data: setting } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'challenges_enabled')
    .maybeSingle()
  if (!challengesEnabled(setting?.setting_value)) return refuse('challenges_disabled')

  const { data: stored } = await admin
    .from('exercises')
    .select(
      `id, title, instructions, exercise_type, exercise_config, status, is_challengeable, system_prompt, ${GRADING_SECRETS_EMBED}`
    )
    .eq('id', link.exercise_id)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const exercise = stored ? withGradingSecrets(stored) : null
  if (
    !exercise ||
    exercise.status !== 'published' ||
    exercise.is_challengeable !== true ||
    !isChallengeableType(exercise.exercise_type as string)
  ) {
    return refuse('exercise_unavailable')
  }

  if (!(await deps.hasAiGrading(tenantId))) return refuse('plan_feature_required')

  // This person's earlier attempts at this exercise.
  let prior = admin
    .from('challenge_attempts')
    .select('id, score, passed, feedback, is_official, answer, created_at')
    .eq('tenant_id', tenantId)
    .eq('exercise_id', link.exercise_id)
    .order('created_at', { ascending: true })
  prior = identity.userId ? prior.eq('user_id', identity.userId) : prior.eq('guest_token_hash', identity.guestTokenHash!)
  const { data: attempts } = await prior

  const passingScoreOf = (ex: { exercise_config?: unknown }) => {
    const v = (ex.exercise_config as { passing_score?: unknown } | null)?.passing_score
    return typeof v === 'number' ? v : 70
  }

  // Same answer again: the stored grade, no AI call, no new row. Never regraded.
  const repeat = (attempts ?? []).find((a) => (a.answer as { text?: string } | null)?.text === input.answer)
  if (repeat) return { ok: true, result: fromRow(repeat, passingScoreOf(exercise), true) }

  const limits = await checkChallengeLimits({
    tenantId,
    exerciseId: link.exercise_id as number,
    ipHash: identity.ipHash,
    guestTokenHash: identity.guestTokenHash,
  })
  if (limits.status === 'rate_limited') return refuse('rate_limited')
  if (limits.status === 'paused') return refuse('paused')

  const graded = await deps.grade(exercise as ChallengeGradingExercise, input.answer)

  const hasOfficial = (attempts ?? []).some((a) => a.is_official)
  const base = {
    tenant_id: tenantId,
    exercise_id: link.exercise_id as number,
    link_id: link.id as string,
    user_id: identity.userId,
    guest_token_hash: identity.guestTokenHash,
    ip_hash: identity.ipHash,
    answer: { text: input.answer } as Json,
    score: graded.score,
    passed: graded.passed,
    feedback: {
      feedback: graded.feedback,
      strengths: graded.strengths,
      improvements: graded.improvements,
      passing_score: graded.passingScore,
      criteria: graded.criteria,
    } as Json,
  }

  let isOfficial = !hasOfficial
  let { data: row, error } = await admin
    .from('challenge_attempts')
    .insert({ ...base, is_official: isOfficial })
    .select('id, score, passed, feedback, is_official')
    .single()
  if (error?.code === '23505' && isOfficial) {
    // A concurrent request took the official slot first: this one is practice.
    isOfficial = false
    ;({ data: row, error } = await admin
      .from('challenge_attempts')
      .insert({ ...base, is_official: false })
      .select('id, score, passed, feedback, is_official')
      .single())
  }
  if (error || !row) throw new Error('challenge_attempt_persist_failed')

  return { ok: true, result: fromRow(row, graded.passingScore, false) }
}
