import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  type Card,
  type Grade,
  type State,
} from 'ts-fsrs'
import type { DbClient } from '../client'

/**
 * Flashcard review (FSRS spaced repetition, #389) shared by every client (#849).
 *
 * Web, the native app and the MCP server all grade through `gradeReviewCard`,
 * so a card rated on one surface is scheduled exactly as it would be on any
 * other. `review_cards` is own-row under RLS (`students_own_review_cards` is
 * FOR ALL), so every call here runs on the student's own token — no server
 * route, no service role. The scheduling math is ts-fsrs, deterministic, and
 * never delegated to an LLM. The legacy SM-2 `ease` column is neither read nor
 * written; cards migrated from SM-2 were seeded by `20260713120000`.
 */

export const REVIEW_RATINGS = ['again', 'hard', 'good', 'easy'] as const
export type ReviewRating = (typeof REVIEW_RATINGS)[number]

const RATING_TO_FSRS: Record<ReviewRating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
}

/** Default parameters, 90% desired retention — do not hand-roll FSRS math. */
const scheduler = fsrs(generatorParameters({ request_retention: 0.9 }))

/** review_cards columns that carry FSRS state (some reused from SM-2 days). */
export interface FsrsRow {
  interval_days: number
  repetitions: number
  due_at: string
  last_reviewed_at: string | null
  stability: number | null
  difficulty: number | null
  fsrs_state: number
  lapses: number
  learning_steps: number
  elapsed_days: number
}

/** The row fields a grade writes back. */
export interface FsrsUpdate {
  stability: number
  difficulty: number
  fsrs_state: number
  lapses: number
  learning_steps: number
  elapsed_days: number
  interval_days: number
  repetitions: number
  due_at: string
  last_reviewed_at: string
}

const FSRS_COLUMNS =
  'interval_days, repetitions, due_at, last_reviewed_at, stability, difficulty, fsrs_state, lapses, learning_steps, elapsed_days'

/**
 * Rebuild a ts-fsrs Card from a review_cards row. Rows the migration couldn't
 * seed (never reviewed, or created before FSRS with no history) are new cards.
 */
export function cardFromRow(row: FsrsRow, now: Date): Card {
  if (row.stability === null || row.difficulty === null) {
    return createEmptyCard(now)
  }
  return {
    due: new Date(row.due_at),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.interval_days,
    learning_steps: row.learning_steps,
    reps: row.repetitions,
    lapses: row.lapses,
    state: row.fsrs_state as State,
    // Migration-seeded rows always have last_reviewed_at (every grade wrote
    // it); fall back to "just now" so elapsed time can never go negative.
    last_review: row.last_reviewed_at ? new Date(row.last_reviewed_at) : now,
  }
}

/** Grade one card with FSRS and return the row fields to persist. */
export function gradeCard(row: FsrsRow, rating: ReviewRating, now: Date): FsrsUpdate {
  const { card } = scheduler.next(cardFromRow(row, now), now, RATING_TO_FSRS[rating])
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    fsrs_state: card.state as number,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    elapsed_days: card.elapsed_days,
    interval_days: card.scheduled_days,
    repetitions: card.reps,
    due_at: card.due.toISOString(),
    last_reviewed_at: now.toISOString(),
  }
}

/**
 * Cards due now — the same predicate `get_daily_digest_candidates` counts with,
 * so the number a client shows is the number the nudge was sent about.
 */
export function getDueReviewCount(
  supabase: DbClient,
  userId: string,
  tenantId: string
): PromiseLike<{ count: number | null; error: { message: string } | null }> {
  return supabase
    .from('review_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('suspended', false)
    .lte('due_at', new Date().toISOString())
}

export interface DueReviewCard {
  id: number
  front: string
  back: string
  repetitions: number
  interval_days: number
  due_at: string
  course_id: number | null
  lesson_id: number | null
}

/** Due cards, oldest due first, plus how many are due in total. */
export function getDueReviewCards(
  supabase: DbClient,
  userId: string,
  tenantId: string,
  limit = 20
): PromiseLike<{ data: DueReviewCard[] | null; count: number | null; error: { message: string } | null }> {
  return supabase
    .from('review_cards')
    .select('id, front, back, repetitions, interval_days, due_at, course_id, lesson_id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('suspended', false)
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(limit)
}

export type GradeReviewResult =
  | { ok: true; card_id: number; rating: ReviewRating; next: FsrsUpdate }
  | { ok: false; reason: 'not_found' | 'error'; message: string }

/**
 * Record a self-rating: read the card's FSRS state, schedule it, write it back.
 * The read is scoped to the caller's own card in this tenant, so a card id from
 * another student or school answers `not_found`, never a write.
 */
export async function gradeReviewCard(
  supabase: DbClient,
  userId: string,
  tenantId: string,
  cardId: number,
  rating: ReviewRating,
  now: Date = new Date()
): Promise<GradeReviewResult> {
  const { data: row, error } = await supabase
    .from('review_cards')
    .select(FSRS_COLUMNS)
    .eq('id', cardId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (error) return { ok: false, reason: 'error', message: `Loading card: ${error.message}` }
  if (!row) return { ok: false, reason: 'not_found', message: `Card ${cardId} not found` }

  const next = gradeCard(row as FsrsRow, rating, now)
  const { error: updateError } = await supabase
    .from('review_cards')
    .update(next)
    .eq('id', cardId)
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
  if (updateError) return { ok: false, reason: 'error', message: `Updating card: ${updateError.message}` }

  return { ok: true, card_id: cardId, rating, next }
}
