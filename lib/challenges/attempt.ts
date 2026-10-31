import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/database.types'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { isChallengeableType, resolveRubric, rubricVersion, type ChallengeGrade, type ChallengeGradingExercise } from '@/lib/challenges/grade'
import { checkChallengeLimits } from '@/lib/challenges/limits'
import { isChallengesEnabled } from '@/lib/challenges/settings'
import { isVoiceChallengeType } from '@/lib/challenges/types'
import type { ConversationTurn } from '@/lib/speech/conversation'
import type { VoiceClaim } from '@/lib/challenges/voice-session'

export const MAX_ANSWER_CHARS = 20_000

/** `answer` is the text graded: typed by the player, or the transcript rendered from `voice.turns`. */
export interface AttemptInput {
  token: string
  answer: string
  voice?: VoiceSubmission
}

export type AttemptRefusal =
  | 'link_not_found'
  | 'tenant_mismatch'
  | 'link_inactive'
  | 'challenges_disabled'
  | 'exercise_unavailable'
  | 'plan_feature_required'
  | 'rate_limited'
  | 'paused'
  | 'in_progress'
  /** Voice retos are for signed-in members only (see `lib/challenges/types.ts`). */
  | 'members_only'
  /** Text sent to a voice reto, or a transcript sent to a text one. */
  | 'invalid_submission'
  | 'no_session'
  | 'session_too_long'
  | 'invalid_transcript'

/** A voice attempt: the call's tab key and the transcript the browser reports. */
export interface VoiceSubmission {
  tab: string
  turns: ConversationTurn[]
}

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
  /** True when this person already holds an official attempt, so this one is practice. */
  officialAlreadyTaken?: true
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
  /**
   * Called for a MEMBER's official attempt (and a repeat of it) to mirror it into
   * the normal exercise tables. Idempotent and best-effort: a failure here never
   * fails the attempt. Guests are materialized later, at claim time.
   */
  materialize?: (input: { attemptId: string; tenantId: string; userId: string }) => Promise<unknown>
  /**
   * Called once a NEW official attempt is persisted (F5: tell link owners they were
   * beaten). Best-effort: a failure or rejection never fails the attempt.
   */
  onOfficialAttempt?: (input: { attemptId: string; tenantId: string }) => Promise<unknown>
  /**
   * Voice retos only. `claim` accepts the transcript against a session this
   * member opened; `settle` closes it (`completed`) or re-opens it (`pending`)
   * when the attempt did not produce a grade.
   */
  voice?: {
    claim: (input: { tenantId: string; userId: string; exerciseId: number; tab: string; exerciseConfig: unknown; turns: ConversationTurn[] }) => Promise<VoiceClaim>
    settle: (input: { tenantId: string; sessionId: string; status: 'pending' | 'completed' }) => Promise<unknown>
  }
}

/** True when PostgREST/Postgres says `challenge_attempts.rubric_version` does not exist yet. */
function isMissingRubricColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    (error.code === '42703' || error.code === 'PGRST204') && /rubric_version/.test(error.message ?? '')
  )
}

interface StoredFeedback {
  feedback?: string
  strengths?: string[]
  improvements?: string[]
  passing_score?: number
}

function fromRow(
  row: { id: string; score: number; passed: boolean; feedback: Json | null; is_official: boolean },
  fallbackPassingScore: number,
  alreadyGraded: boolean,
  officialAlreadyTaken = false
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
    ...(officialAlreadyTaken && !row.is_official ? { officialAlreadyTaken: true as const } : {}),
    alreadyGraded,
  }
}

/**
 * One challenge attempt: validate, grade once, persist to `challenge_attempts`,
 * never return answer keys. A MEMBER's first official attempt is additionally
 * mirrored into `exercise_evaluations` / `exercise_completions` (XP once) via
 * `deps.materialize`; guests are mirrored when they claim (see materialize.ts).
 */
/**
 * In-flight submissions per identity+exercise. Per server instance only: it
 * stops one browser (or script) from paying for N identical concurrent grades
 * on one instance; across instances the unique official index is the backstop
 * (residual: parallel practice grades on different instances).
 */
const inFlight = new Set<string>()

export async function submitChallengeAttempt(
  deps: AttemptDeps,
  input: AttemptInput,
  identity: AttemptIdentity
): Promise<AttemptOutcome> {
  const key = `${identity.userId ?? identity.guestTokenHash}:${input.token}`
  if (inFlight.has(key)) return { ok: false, refusal: 'in_progress' }
  inFlight.add(key)
  try {
    return await runAttempt(deps, input, identity)
  } finally {
    inFlight.delete(key)
  }
}

async function runAttempt(
  deps: AttemptDeps,
  input: AttemptInput,
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
  if (!isChallengesEnabled(setting?.setting_value)) return refuse('challenges_disabled')

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

  // A voice reto is a call, never typed text (anyone could type a perfect
  // "conversation"), and a call costs the school realtime minutes, so only a
  // signed-in member may play one.
  const isVoice = isVoiceChallengeType(exercise.exercise_type as string)
  if (isVoice !== Boolean(input.voice)) return refuse('invalid_submission')
  let sessionId: string | null = null
  if (isVoice) {
    if (!identity.userId) return refuse('members_only')
    if (!deps.voice || !input.voice) return refuse('invalid_submission')
    const claim = await deps.voice.claim({
      tenantId,
      userId: identity.userId,
      exerciseId: link.exercise_id as number,
      tab: input.voice.tab,
      exerciseConfig: exercise.exercise_config,
      turns: input.voice.turns,
    })
    if (!claim.ok) return refuse(claim.reason)
    sessionId = claim.sessionId
  }

  // Whatever happens next, the session is closed on success and re-opened otherwise
  // (a grader hiccup or a rate limit must not cost the member the call they just had).
  const settle = async (status: 'pending' | 'completed') => {
    if (sessionId && deps.voice) {
      try {
        await deps.voice.settle({ tenantId, sessionId, status })
      } catch (err) {
        console.error('voice session settle failed:', err instanceof Error ? err.message : err)
      }
    }
  }
  try {
    const outcome = await gradeAndPersist(deps, input, identity, { linkId: link.id as string, exerciseId: link.exercise_id as number, tenantId, exercise })
    await settle(outcome.ok ? 'completed' : 'pending')
    return outcome
  } catch (err) {
    await settle('pending')
    throw err
  }
}

interface AttemptContext {
  linkId: string
  exerciseId: number
  tenantId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- row shape from the loose admin client
  exercise: any
}

async function gradeAndPersist(
  deps: AttemptDeps,
  input: AttemptInput,
  identity: AttemptIdentity,
  { linkId, exerciseId, tenantId, exercise }: AttemptContext
): Promise<AttemptOutcome> {
  const { admin } = deps
  const refuse = (refusal: AttemptRefusal): AttemptOutcome => ({ ok: false, refusal })
  const link = { id: linkId, exercise_id: exerciseId }
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
  if (repeat) {
    // Retry a mirror that may have failed the first time (idempotent).
    if (repeat.is_official && identity.userId) await safeMaterialize(deps, repeat.id as string, tenantId, identity.userId)
    return { ok: true, result: fromRow(repeat, passingScoreOf(exercise), true, (attempts ?? []).some((a) => a.is_official)) }
  }

  const limits = await checkChallengeLimits({
    tenantId,
    exerciseId: link.exercise_id as number,
    ipHash: identity.ipHash,
    guestTokenHash: identity.guestTokenHash,
    userId: identity.userId,
  })
  if (limits.status === 'rate_limited') return refuse('rate_limited')
  if (limits.status === 'paused') return refuse('paused')

  const graded = await deps.grade(exercise as ChallengeGradingExercise, input.answer)

  // WS7 may force practice (e.g. the guest monthly cap is spent).
  const officialAlreadyTaken = (attempts ?? []).some((a) => a.is_official)
  const hasOfficial = limits.official === false || officialAlreadyTaken
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
  const version = rubricVersion(resolveRubric(exercise.exercise_config, exercise.exercise_type as string))

  // Tolerant of a database that has not applied the rubric_version migration yet.
  const insert = async (official: boolean) => {
    const cols = 'id, score, passed, feedback, is_official'
    const res = await admin
      .from('challenge_attempts')
      .insert({ ...base, rubric_version: version, is_official: official })
      .select(cols)
      .single()
    if (!isMissingRubricColumn(res.error)) return res
    return admin.from('challenge_attempts').insert({ ...base, is_official: official }).select(cols).single()
  }

  let isOfficial = !hasOfficial
  let { data: row, error } = await insert(isOfficial)
  if (isOfficial && error?.code === '23505' && /challenge_attempts_official_/.test(`${error.message ?? ''} ${error.details ?? ''}`)) {
    // A concurrent request took the official slot first: this one is practice.
    isOfficial = false
    ;({ data: row, error } = await insert(false))
  }
  if (error || !row) throw new Error('challenge_attempt_persist_failed')

  if (isOfficial && identity.userId) await safeMaterialize(deps, row.id as string, tenantId, identity.userId)
  if (isOfficial && identity.userId) await safeOnOfficial(deps, row.id as string, tenantId)

  return { ok: true, result: fromRow(row, graded.passingScore, false, officialAlreadyTaken) }
}

async function safeMaterialize(deps: AttemptDeps, attemptId: string, tenantId: string, userId: string) {
  if (!deps.materialize) return
  try {
    await deps.materialize({ attemptId, tenantId, userId })
  } catch (err) {
    console.error('challenge attempt materialization failed:', err instanceof Error ? err.message : err)
  }
}

async function safeOnOfficial(deps: AttemptDeps, attemptId: string, tenantId: string) {
  if (!deps.onOfficialAttempt) return
  try {
    await deps.onOfficialAttempt({ attemptId, tenantId })
  } catch (err) {
    console.error('challenge official-attempt hook failed:', err instanceof Error ? err.message : err)
  }
}
