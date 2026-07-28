/**
 * Confusion hotspots — where a course's students collectively struggle.
 *
 * WHAT THIS ANSWERS
 *   "Is this exercise too hard?" A teacher authors an exercise, labels it
 *   `easy | medium | hard`, and then never finds out whether the label matched
 *   reality. This module fuses every per-item outcome signal the schema keeps
 *   — practice drills, exercise evaluations, lesson checkpoints, exam-question
 *   scores — into one severity-ranked list, and cross-checks the teacher's
 *   declared difficulty against the Elo rating the platform derived from actual
 *   attempts (`item_ratings`, #396).
 *
 * TWIN IMPLEMENTATION — KEEP IN SYNC
 *   `mcp-server/src/tools/analytics.ts` → `lms_get_confusion_hotspots` computes
 *   the same thing for MCP clients. The two cannot share code today: the MCP
 *   server is a standalone package (not part of the root `packages/*`
 *   workspace) that deploys as its own Docker service, so it has no import path
 *   into `lib/`. A divergent second reader of a metric is exactly the failure
 *   mode that produced #547, so the shared parts are deliberately identical:
 *   the severity formula, `MISS_RATIO`, `LOW_SCORE`, `MIN_RATED_ATTEMPTS`, and
 *   `DIFFICULTY_BANDS`. Change one, change both in the same commit.
 *
 *   ONE DELIBERATE DIFFERENCE: this module also reads
 *   `lesson_checkpoint_attempts` (a 4th signal, `scope: 'checkpoint'`), which
 *   the MCP tool does not. The page can afford the extra round trip and the
 *   table ships a purpose-built `..._teacher_metrics_idx` for exactly this
 *   query; the tool was left alone to keep a shipped payload stable. So the
 *   page can surface a hotspot the tool will not — never the reverse.
 *
 *   The second difference is presentational: this module returns only numbers
 *   per hotspot, never a prebuilt sentence, because the page renders in `en`
 *   and `es`. (It first returned an `evidence` string, which left every hotspot
 *   detail line stuck in English on `/es` while the rest of the page
 *   translated.) The MCP tool keeps its English `evidence` string — its reader
 *   is a model, not a localised UI.
 *
 * RLS
 *   Every read below runs as the signed-in teacher. Each source table has a
 *   teacher-scoped SELECT policy (`teachers_view_tenant_evaluations`,
 *   `lesson_checkpoint_attempts_teachers_read_tenant`,
 *   `teachers_view_tenant_practice_attempts`, `tenant_members_view_item_ratings`,
 *   "Teachers can view exam question scores for their courses"), so a teacher
 *   only ever sees their own tenant's rows. Nothing here uses the admin client.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

// ── Public types ─────────────────────────────────────────────────────────────

export type HotspotScope = 'practice' | 'exercise' | 'checkpoint' | 'exam_question'

export interface Hotspot {
  scope: HotspotScope
  /** Exercise id, question id, checkpoint id, or topic name — whatever identifies the item. */
  ref: number | string | null
  label: string
  /** Students who failed / scored low on this item. */
  studentsAffected: number
  /** Students who attempted it at all — the denominator that makes the count readable. */
  studentsAttempted: number
  /** 0–100. See `SEVERITY_FORMULA`. */
  severity: number
  /** Mean score where the signal carries one (practice, exercises, checkpoints). */
  avgScore: number | null
  /** Mean attempts per student where the signal tracks attempts. */
  avgAttempts: number | null
  /** Course lesson this item belongs to, when known — lets the page deep-link. */
  lessonId: number | null
  /** Total attempts behind this row, where the signal counts them (practice only). */
  totalAttempts: number | null
}

export type DifficultyLabel = 'easy' | 'medium' | 'hard'

export type DifficultyMismatch = 'harder_than_labeled' | 'easier_than_labeled'

export interface HardestItem {
  itemType: 'exercise' | 'exam_question'
  itemId: number
  title: string
  /** Elo rating derived from real attempts. 1500 is the seeded baseline. */
  rating: number
  attemptCount: number
  /** The teacher's own label. `null` for exam questions, which have none. */
  declaredDifficulty: DifficultyLabel | null
  /** Set only when the Elo rating falls outside the band the label implies. */
  mismatch: DifficultyMismatch | null
}

export interface ConfusionHotspots {
  courseId: number
  windowDays: number
  hotspots: Hotspot[]
  hardestItems: HardestItem[]
  /** How many rows each signal contributed — so an empty page can explain itself. */
  sources: {
    practiceAttempts: number
    exerciseEvaluations: number
    checkpointAttempts: number
    examSubmissions: number
    ratedItems: number
  }
  /**
   * Signals that could not be read. A page showing "no hotspots" because a
   * query failed looks identical to one showing "no hotspots" because students
   * are doing fine — these say which it was, so the difference is never silent.
   */
  warnings: string[]
  /** True when more hotspots were found than `HOTSPOT_LIMIT` returns. */
  truncated: boolean
}

/**
 * Run one signal's loader, downgrading a failure to a named warning.
 *
 * A single missing table or a truncated sweep must not blank the whole page,
 * but it must never masquerade as "no students are struggling" either — the
 * caller surfaces every warning in the UI.
 */
async function attempt<T>(
  signal: string,
  fallback: T,
  run: () => Promise<T>
): Promise<{ value: T; warning: string | null }> {
  try {
    return { value: await run(), warning: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { value: fallback, warning: `${signal}: ${message}` }
  }
}

// ── Tunables (mirrored in the MCP tool — change both) ────────────────────────

/** A per-question result below this share of available points counts as a miss. */
const MISS_RATIO = 0.7

/** Practice / checkpoint scores below this are "struggling". */
const LOW_SCORE = 70

/** Elo attempts below this are too noisy to call an item hard. */
const MIN_RATED_ATTEMPTS = 3

const HOTSPOT_LIMIT = 20
const HARDEST_LIMIT = 10

export const SEVERITY_FORMULA =
  'severity = round(intensity * 60 + min(students_affected, 10) * 4), capped at 100.'

/**
 * Severity blends *how badly* the group fails an item with *how many* students
 * it touches, so one stuck student on an impossible item never outranks half
 * the class on a merely hard one.
 */
function severityOf(intensity: number, students: number): number {
  const clamped = Math.max(0, Math.min(1, intensity))
  return Math.min(100, Math.round(clamped * 60 + Math.min(students, 10) * 4))
}

/**
 * Elo bands each label implies. A rating above a label's ceiling means the item
 * plays harder than the teacher claimed; below its floor, easier. Bands overlap
 * deliberately — only a clear divergence is worth surfacing as a mismatch.
 */
const DIFFICULTY_BANDS: Record<DifficultyLabel, { floor: number; ceiling: number }> = {
  easy: { floor: Number.NEGATIVE_INFINITY, ceiling: 1550 },
  medium: { floor: 1380, ceiling: 1680 },
  hard: { floor: 1500, ceiling: Number.POSITIVE_INFINITY },
}

export function difficultyMismatch(
  declared: DifficultyLabel | null,
  rating: number
): DifficultyMismatch | null {
  if (!declared) return null
  const band = DIFFICULTY_BANDS[declared]
  if (!band) return null
  if (rating > band.ceiling) return 'harder_than_labeled'
  if (rating < band.floor) return 'easier_than_labeled'
  return null
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

// ── Row shapes (only the columns each query selects) ─────────────────────────

interface PracticeRow {
  topic: string | null
  lesson_id: number | null
  score: number | null
  user_id: string
}

interface EvaluationRow {
  exercise_id: number
  user_id: string
  attempt_number: number | null
  passed: boolean | null
  score: number | null
  created_at: string
}

interface CheckpointRow {
  checkpoint_id: number
  exercise_id: number | null
  lesson_id: number | null
  user_id: string
  attempt_number: number | null
  passed: boolean | null
  score: number | null
  created_at: string
}

interface SubmissionRow {
  submission_id: number
  student_id: string
  exam_id: number
  /** Nullable in the schema — treated as oldest when picking the latest retake. */
  submission_date: string | null
}

interface QuestionScoreRow {
  submission_id: number
  question_id: number
  is_correct: boolean | null
  points_earned: number | null
  points_possible: number | null
}

interface RatingRow {
  item_type: 'exercise' | 'exam_question'
  item_id: number
  rating: number
  attempt_count: number
}

/** The generated schema client. Typed so every `.select()` below is checked. */
type Db = SupabaseClient<Database>

// ── Entry point ──────────────────────────────────────────────────────────────

export async function getConfusionHotspots(
  supabase: Db,
  {
    courseId,
    tenantId,
    days = 30,
  }: { courseId: number; tenantId: string; days?: number }
): Promise<ConfusionHotspots> {
  const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString()

  const [practice, evaluations, checkpoints, exams, rated] = await Promise.all([
    attempt('Practice drills', { hotspots: [] as Hotspot[], rowCount: 0 }, () =>
      loadPractice(supabase, courseId, tenantId, cutoffIso)
    ),
    attempt('Exercise attempts', { hotspots: [] as Hotspot[], rowCount: 0 }, () =>
      loadEvaluations(supabase, courseId, tenantId, cutoffIso)
    ),
    attempt('Lesson checkpoints', { hotspots: [] as Hotspot[], rowCount: 0 }, () =>
      loadCheckpoints(supabase, courseId, tenantId, cutoffIso)
    ),
    attempt('Exam questions', { hotspots: [] as Hotspot[], submissionCount: 0 }, () =>
      loadExamQuestionMisses(supabase, courseId, tenantId, cutoffIso)
    ),
    attempt('Difficulty ratings', { items: [] as HardestItem[] }, () =>
      loadHardestItems(supabase, courseId, tenantId)
    ),
  ])

  const hotspots = [
    ...practice.value.hotspots,
    ...evaluations.value.hotspots,
    ...checkpoints.value.hotspots,
    ...exams.value.hotspots,
  ].sort((a, b) => b.severity - a.severity)

  const warnings = [practice, evaluations, checkpoints, exams, rated]
    .map((r) => r.warning)
    .filter((w): w is string => w !== null)

  return {
    courseId,
    windowDays: days,
    hotspots: hotspots.slice(0, HOTSPOT_LIMIT),
    hardestItems: rated.value.items,
    sources: {
      practiceAttempts: practice.value.rowCount,
      exerciseEvaluations: evaluations.value.rowCount,
      checkpointAttempts: checkpoints.value.rowCount,
      examSubmissions: exams.value.submissionCount,
      ratedItems: rated.value.items.length,
    },
    warnings,
    truncated: hotspots.length > HOTSPOT_LIMIT,
  }
}

// ── Signal 1: practice drills, grouped by topic ──────────────────────────────

async function loadPractice(
  supabase: Db,
  courseId: number,
  tenantId: string,
  cutoffIso: string
): Promise<{ hotspots: Hotspot[]; rowCount: number }> {
  const rows = await fetchAllRows<PracticeRow>('practice_attempts', (from, to) =>
    supabase
      .from('practice_attempts')
      .select('topic, lesson_id, score, user_id', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .gte('created_at', cutoffIso)
      .order('id')
      .range(from, to)
  )

  const byTopic = new Map<
    string,
    { scores: number[]; users: Set<string>; struggling: Set<string>; lessonId: number | null }
  >()
  for (const r of rows) {
    const topic = r.topic ?? 'Untitled topic'
    const bucket = byTopic.get(topic) ?? {
      scores: [],
      users: new Set<string>(),
      struggling: new Set<string>(),
      lessonId: r.lesson_id,
    }
    const score = Number(r.score ?? 0)
    bucket.scores.push(score)
    bucket.users.add(r.user_id)
    if (score < LOW_SCORE) bucket.struggling.add(r.user_id)
    byTopic.set(topic, bucket)
  }

  const hotspots: Hotspot[] = []
  for (const [topic, b] of byTopic) {
    if (b.struggling.size === 0) continue
    const avg = mean(b.scores) ?? 0
    hotspots.push({
      scope: 'practice',
      ref: topic,
      label: topic,
      studentsAffected: b.struggling.size,
      studentsAttempted: b.users.size,
      severity: severityOf(1 - avg / 100, b.struggling.size),
      avgScore: Math.round(avg),
      avgAttempts: null,
      lessonId: b.lessonId,
      totalAttempts: b.scores.length,
    })
  }
  return { hotspots, rowCount: rows.length }
}

// ── Signal 2: exercise evaluations, per exercise ─────────────────────────────

async function loadEvaluations(
  supabase: Db,
  courseId: number,
  tenantId: string,
  cutoffIso: string
): Promise<{ hotspots: Hotspot[]; rowCount: number }> {
  // Scope to this course's exercises explicitly. `exercise_evaluations` has no
  // course_id, and an embedded !inner filter cannot be combined with the exact
  // count `fetchAllRows` asserts against.
  const { data: exerciseRows, error: exerciseErr } = await supabase
    .from('exercises')
    .select('id, title, lesson_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
  if (exerciseErr) throw new Error(exerciseErr.message)
  if (!exerciseRows || exerciseRows.length === 0) {
    return { hotspots: [], rowCount: 0 }
  }
  const meta = new Map<number, { title: string; lessonId: number | null }>(
    exerciseRows.map((e) => [
      e.id as number,
      { title: (e.title as string) ?? `Exercise ${e.id}`, lessonId: (e.lesson_id as number) ?? null },
    ])
  )
  const exerciseIds = [...meta.keys()]

  const rows = await fetchAllRows<EvaluationRow>('exercise_evaluations', (from, to) =>
    supabase
      .from('exercise_evaluations')
      .select('exercise_id, user_id, attempt_number, passed, score, created_at', {
        count: 'exact',
      })
      .eq('tenant_id', tenantId)
      .in('exercise_id', exerciseIds)
      .gte('created_at', cutoffIso)
      .order('id')
      .range(from, to)
  )

  const hotspots = rollUpAttempts(
    rows.map((r) => ({
      key: r.exercise_id,
      userId: r.user_id,
      attemptNumber: r.attempt_number,
      passed: r.passed,
      score: r.score,
      createdAt: r.created_at,
    })),
    (key) => ({
      scope: 'exercise' as const,
      ref: key,
      label: meta.get(key)?.title ?? `Exercise ${key}`,
      lessonId: meta.get(key)?.lessonId ?? null,
    })
  )
  return { hotspots, rowCount: rows.length }
}

// ── Signal 3: lesson checkpoints ─────────────────────────────────────────────

async function loadCheckpoints(
  supabase: Db,
  courseId: number,
  tenantId: string,
  cutoffIso: string
): Promise<{ hotspots: Hotspot[]; rowCount: number }> {
  const rows = await fetchAllRows<CheckpointRow>('lesson_checkpoint_attempts', (from, to) =>
    supabase
      .from('lesson_checkpoint_attempts')
      .select(
        'checkpoint_id, exercise_id, lesson_id, user_id, attempt_number, passed, score, created_at',
        { count: 'exact' }
      )
      .eq('tenant_id', tenantId)
      .eq('course_id', courseId)
      .gte('created_at', cutoffIso)
      .order('id')
      .range(from, to)
  )
  if (rows.length === 0) return { hotspots: [], rowCount: 0 }

  // Name checkpoints after the exercise they gate — the id alone is unreadable.
  const exerciseIds = [...new Set(rows.map((r) => r.exercise_id).filter((id): id is number => id != null))]
  const titles = new Map<number, string>()
  if (exerciseIds.length > 0) {
    const { data } = await supabase
      .from('exercises')
      .select('id, title')
      .in('id', exerciseIds)
    for (const e of data ?? []) titles.set(e.id, e.title)
  }

  const lessonByCheckpoint = new Map<number, number | null>()
  for (const r of rows) if (!lessonByCheckpoint.has(r.checkpoint_id)) lessonByCheckpoint.set(r.checkpoint_id, r.lesson_id)
  const exerciseByCheckpoint = new Map<number, number | null>()
  for (const r of rows) if (!exerciseByCheckpoint.has(r.checkpoint_id)) exerciseByCheckpoint.set(r.checkpoint_id, r.exercise_id)

  const hotspots = rollUpAttempts(
    rows.map((r) => ({
      key: r.checkpoint_id,
      userId: r.user_id,
      attemptNumber: r.attempt_number,
      passed: r.passed,
      score: r.score,
      createdAt: r.created_at,
    })),
    (key) => {
      const exId = exerciseByCheckpoint.get(key)
      const title = exId != null ? titles.get(exId) : undefined
      return {
        scope: 'checkpoint' as const,
        ref: key,
        label: title ?? `Checkpoint ${String(key).slice(0, 8)}`,
        lessonId: lessonByCheckpoint.get(key) ?? null,
      }
    }
  )
  return { hotspots, rowCount: rows.length }
}

/**
 * Shared roll-up for the two pass/fail-with-attempts signals.
 *
 * Only a student's LATEST attempt decides whether they are stuck — someone who
 * failed twice and then passed has learned the thing, and counting their early
 * failures would permanently mark every item students struggle with before
 * succeeding. Attempt counts still come from the full history, because "they
 * got there, but it took six tries" is the difficulty signal.
 */
function rollUpAttempts<K extends string | number>(
  rows: Array<{
    key: K
    userId: string
    attemptNumber: number | null
    passed: boolean | null
    score: number | null
    createdAt: string
  }>,
  describe: (key: K) => { scope: HotspotScope; ref: number | string | null; label: string; lessonId: number | null }
): Hotspot[] {
  const latest = new Map<string, { key: K; userId: string; passed: boolean | null; score: number | null; createdAt: string }>()
  const maxAttempts = new Map<string, number>()

  for (const r of rows) {
    const composite = `${String(r.key)}::${r.userId}`
    const prev = latest.get(composite)
    if (!prev || r.createdAt > prev.createdAt) {
      latest.set(composite, { key: r.key, userId: r.userId, passed: r.passed, score: r.score, createdAt: r.createdAt })
    }
    maxAttempts.set(composite, Math.max(maxAttempts.get(composite) ?? 1, Number(r.attemptNumber ?? 1)))
  }

  const byItem = new Map<
    K,
    { stuck: Set<string>; attempted: Set<string>; attempts: number[]; scores: number[] }
  >()
  for (const [composite, r] of latest) {
    const bucket = byItem.get(r.key) ?? {
      stuck: new Set<string>(),
      attempted: new Set<string>(),
      attempts: [],
      scores: [],
    }
    bucket.attempted.add(r.userId)
    bucket.attempts.push(maxAttempts.get(composite) ?? 1)
    if (r.score != null) bucket.scores.push(Number(r.score))
    if (r.passed === false) bucket.stuck.add(r.userId)
    byItem.set(r.key, bucket)
  }

  const out: Hotspot[] = []
  for (const [key, b] of byItem) {
    if (b.stuck.size === 0) continue
    const d = describe(key)
    const avgAttempts = mean(b.attempts) ?? 1
    const avgScore = mean(b.scores)
    out.push({
      scope: d.scope,
      ref: d.ref,
      label: d.label,
      studentsAffected: b.stuck.size,
      studentsAttempted: b.attempted.size,
      severity: severityOf(b.stuck.size / b.attempted.size, b.stuck.size),
      avgScore: avgScore == null ? null : Math.round(avgScore),
      avgAttempts: Math.round(avgAttempts * 10) / 10,
      lessonId: d.lessonId,
      totalAttempts: null,
    })
  }
  return out
}

// ── Signal 4: exam-question miss rates ───────────────────────────────────────

async function loadExamQuestionMisses(
  supabase: Db,
  courseId: number,
  tenantId: string,
  cutoffIso: string
): Promise<{ hotspots: Hotspot[]; submissionCount: number }> {
  const { data: exams, error: examsErr } = await supabase
    .from('exams')
    .select('exam_id, title')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
  if (examsErr) throw new Error(examsErr.message)
  const examTitles = new Map<number, string>(
    (exams ?? []).map((e) => [e.exam_id, e.title])
  )
  if (examTitles.size === 0) return { hotspots: [], submissionCount: 0 }

  const submissions = await fetchAllRows<SubmissionRow>('exam_submissions', (from, to) =>
    supabase
      .from('exam_submissions')
      .select('submission_id, student_id, exam_id, submission_date', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .in('exam_id', [...examTitles.keys()])
      .gte('submission_date', cutoffIso)
      .order('submission_id')
      .range(from, to)
  )

  // Latest submission per (student, exam) — a retake supersedes its predecessor.
  const latestSub = new Map<string, SubmissionRow>()
  for (const s of submissions) {
    const key = `${s.student_id}::${s.exam_id}`
    const prev = latestSub.get(key)
    if (!prev || (s.submission_date ?? '') > (prev.submission_date ?? '')) latestSub.set(key, s)
  }
  const subById = new Map<number, SubmissionRow>([...latestSub.values()].map((s) => [s.submission_id, s]))
  if (subById.size === 0) return { hotspots: [], submissionCount: 0 }

  const scores = await fetchAllRows<QuestionScoreRow>('exam_question_scores', (from, to) =>
    supabase
      .from('exam_question_scores')
      // exam_question_scores has NO tenant_id — it is reachable only through
      // the submission ids above, which are already tenant- and course-scoped.
      .select('submission_id, question_id, is_correct, points_earned, points_possible', {
        count: 'exact',
      })
      .in('submission_id', [...subById.keys()])
      .order('score_id')
      .range(from, to)
  )

  const questionIds = [...new Set(scores.map((s) => s.question_id))]
  const questionMeta = new Map<number, { text: string; examId: number | null }>()
  if (questionIds.length > 0) {
    // exam_questions has NO tenant_id either — same containment argument.
    const { data } = await supabase
      .from('exam_questions')
      .select('question_id, question_text, exam_id')
      .in('question_id', questionIds)
    for (const q of data ?? []) {
      questionMeta.set(q.question_id, {
        text: q.question_text ?? `Question ${q.question_id}`,
        examId: q.exam_id ?? null,
      })
    }
  }

  const byQuestion = new Map<number, { attempts: number; missers: Set<string> }>()
  for (const row of scores) {
    const sub = subById.get(row.submission_id)
    if (!sub) continue
    const bucket = byQuestion.get(row.question_id) ?? { attempts: 0, missers: new Set<string>() }
    bucket.attempts += 1
    const possible = Number(row.points_possible ?? 0)
    const earned = Number(row.points_earned ?? 0)
    const missed =
      row.is_correct === false || (possible > 0 && earned / possible < MISS_RATIO)
    if (missed) bucket.missers.add(sub.student_id)
    byQuestion.set(row.question_id, bucket)
  }

  const hotspots: Hotspot[] = []
  for (const [questionId, b] of byQuestion) {
    if (b.missers.size === 0) continue
    const missRate = b.missers.size / b.attempts
    const meta = questionMeta.get(questionId)
    const examTitle = meta?.examId != null ? examTitles.get(meta.examId) : null
    const text = meta?.text ?? `Question ${questionId}`
    hotspots.push({
      scope: 'exam_question',
      ref: questionId,
      label: `${examTitle ? `${examTitle}: ` : ''}${text.length > 120 ? `${text.slice(0, 120)}…` : text}`,
      studentsAffected: b.missers.size,
      studentsAttempted: b.attempts,
      severity: severityOf(missRate, b.missers.size),
      avgScore: null,
      avgAttempts: null,
      lessonId: null,
      totalAttempts: null,
    })
  }
  return { hotspots, submissionCount: subById.size }
}

// ── Signal 5: Elo-rated hardest items + label cross-check ────────────────────

async function loadHardestItems(
  supabase: Db,
  courseId: number,
  tenantId: string
): Promise<{ items: HardestItem[] }> {
  const { data, error } = await supabase
    .from('item_ratings')
    .select('item_type, item_id, rating, attempt_count')
    .eq('tenant_id', tenantId)
    .eq('course_id', courseId)
    .in('item_type', ['exercise', 'exam_question'])
    .gte('attempt_count', MIN_RATED_ATTEMPTS)
    .order('rating', { ascending: false })
    .limit(HARDEST_LIMIT)
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) return { items: [] }

  const rows = data as unknown as RatingRow[]
  const exerciseIds = rows.filter((r) => r.item_type === 'exercise').map((r) => r.item_id)
  const questionIds = rows.filter((r) => r.item_type === 'exam_question').map((r) => r.item_id)

  const exerciseMeta = new Map<number, { title: string; difficulty: DifficultyLabel | null }>()
  if (exerciseIds.length > 0) {
    const { data: ex } = await supabase
      .from('exercises')
      .select('id, title, difficulty_level')
      .in('id', exerciseIds)
    for (const e of ex ?? []) {
      exerciseMeta.set(e.id, {
        title: e.title ?? `Exercise ${e.id}`,
        difficulty: e.difficulty_level ?? null,
      })
    }
  }

  const questionText = new Map<number, string>()
  if (questionIds.length > 0) {
    const { data: qs } = await supabase
      .from('exam_questions')
      .select('question_id, question_text')
      .in('question_id', questionIds)
    for (const q of qs ?? []) {
      const text = q.question_text ?? ''
      questionText.set(q.question_id as number, text.length > 120 ? `${text.slice(0, 120)}…` : text)
    }
  }

  const items: HardestItem[] = rows.map((r) => {
    const rating = Math.round(Number(r.rating))
    const declared = r.item_type === 'exercise' ? (exerciseMeta.get(r.item_id)?.difficulty ?? null) : null
    return {
      itemType: r.item_type,
      itemId: r.item_id,
      title:
        r.item_type === 'exercise'
          ? (exerciseMeta.get(r.item_id)?.title ?? `Exercise ${r.item_id}`)
          : (questionText.get(r.item_id) ?? `Question ${r.item_id}`),
      rating,
      attemptCount: r.attempt_count,
      declaredDifficulty: declared,
      mismatch: difficultyMismatch(declared, rating),
    }
  })
  return { items }
}
