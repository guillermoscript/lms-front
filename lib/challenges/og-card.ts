import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRubric } from '@/lib/challenges/grade'
import type { ChallengePageData } from '@/lib/challenges/public-page'

/**
 * What the share card (OG image) may say about a challenge: a score, a
 * pass/fail flag and one bar per rubric criterion. Nothing else.
 *
 * Deliberately NOT in this shape: the answer text, the feedback, the model
 * answer, the rubric descriptions (they are grading secrets, see
 * `collectSecrets`) and any criterion id. A bar is `{ met, weight }`, so the
 * card can never leak what the criteria say.
 */
export interface OgBar {
  met: boolean
  weight: number
}

export interface ChallengeOgCard {
  headline: string
  score: number | null
  passed: boolean | null
  bars: OgBar[]
}

/**
 * Bars from the stored per-criterion verdicts (`feedback.criteria: [{id, met}]`)
 * and the exercise rubric (for weights). Verdicts for criteria the rubric no
 * longer has are ignored; a malformed verdict list yields no bars.
 */
export function buildOgBars(feedback: unknown, exerciseConfig: unknown): OgBar[] {
  const raw = feedback && typeof feedback === 'object' ? (feedback as { criteria?: unknown }).criteria : null
  if (!Array.isArray(raw)) return []
  const verdicts = new Map<string, boolean>()
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { id, met } = entry as { id?: unknown; met?: unknown }
    if (typeof id === 'string' && typeof met === 'boolean') verdicts.set(id, met)
  }
  if (verdicts.size === 0) return []
  return resolveRubric(exerciseConfig)
    .filter((c) => verdicts.has(c.id))
    .map((c) => ({ met: verdicts.get(c.id) === true, weight: c.weight > 0 ? c.weight : 1 }))
}

/** The only object the OG route renders from. Pure: no I/O, no answer text. */
export function buildChallengeOgCard(
  data: Pick<ChallengePageData, 'challenger'>,
  headline: string,
  bars: OgBar[],
): ChallengeOgCard {
  return {
    headline,
    score: data.challenger?.score ?? null,
    passed: data.challenger?.passed ?? null,
    // An open link carries no score, so it has no bars either.
    bars: data.challenger ? bars : [],
  }
}

/** Loads the challenger's criterion verdicts + the rubric weights (admin client, tenant-scoped). Selects only what the bars need. */
export async function loadOgBars(
  admin: SupabaseClient,
  { attemptId, exerciseId, tenantId }: { attemptId: string | null; exerciseId: number; tenantId: string },
): Promise<OgBar[]> {
  if (!attemptId) return []
  const [{ data: attempt }, { data: exercise }] = await Promise.all([
    admin.from('challenge_attempts').select('feedback').eq('id', attemptId).eq('tenant_id', tenantId).maybeSingle(),
    admin.from('exercises').select('exercise_config').eq('id', exerciseId).eq('tenant_id', tenantId).maybeSingle(),
  ])
  return buildOgBars(attempt?.feedback, exercise?.exercise_config)
}
