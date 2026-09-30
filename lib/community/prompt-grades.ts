/**
 * Grades for graded discussion prompts (#873). Pure helpers shared by the
 * teacher's grading view, the grade action, the prompt card, the lesson page
 * and the progress page. The rule itself (who may grade whom, on what) lives in
 * the database — supabase/migrations/20260930120000_community_prompt_grades_873.sql.
 *
 * v1 decision: a graded prompt shows in the student's grades but does NOT count
 * toward course completion or certificate eligibility.
 */

export const GRADE_MIN = 0
export const GRADE_MAX = 100
export const GRADE_FEEDBACK_MAX = 5000

/** What a student sees of their own grade. */
export interface ViewerPromptGrade {
  score: number
  feedback: string | null
  graded_at: string
}

/** A 0–100 integer score from a form value, or null when it is not one. */
export function parseGradeScore(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= GRADE_MIN && raw <= GRADE_MAX ? raw : null
  }
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!/^\d{1,3}$/.test(trimmed)) return null
  return parseGradeScore(Number(trimmed))
}

/** Feedback as stored: trimmed, null when empty, 'invalid' when too long. */
export function normalizeGradeFeedback(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'string') return 'invalid'
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.length > GRADE_FEEDBACK_MAX ? 'invalid' : trimmed
}

/**
 * A due date from the composer (an ISO timestamp the browser built from the
 * teacher's local date), null when none was given, 'invalid' otherwise.
 */
export function parseDueAt(raw: unknown): string | null | 'invalid' {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw !== 'string') return 'invalid'
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? 'invalid' : new Date(ms).toISOString()
}

/**
 * The end of a local calendar day (`YYYY-MM-DD` from `<input type="date">`) as
 * an ISO timestamp, in the browser's timezone. Null for anything else.
 */
export function endOfLocalDayIso(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export type DueState =
  | { kind: 'none' }
  | { kind: 'overdue' }
  | { kind: 'today' }
  | { kind: 'days'; days: number }

const DAY_MS = 24 * 60 * 60 * 1000

/** How a due date reads right now: overdue, due today, or due in N days. */
export function dueState(dueAt: string | null | undefined, now: number = Date.now()): DueState {
  if (!dueAt) return { kind: 'none' }
  const due = Date.parse(dueAt)
  if (Number.isNaN(due)) return { kind: 'none' }
  const left = due - now
  if (left < 0) return { kind: 'overdue' }
  if (left < DAY_MS) return { kind: 'today' }
  return { kind: 'days', days: Math.ceil(left / DAY_MS) }
}

// ---------------------------------------------------------------------------
// The teacher's roster
// ---------------------------------------------------------------------------

export const GRADING_FILTERS = ['all', 'ungraded', 'graded', 'unanswered'] as const
export type GradingFilter = (typeof GRADING_FILTERS)[number]

export function parseGradingFilter(raw: string | string[] | null | undefined): GradingFilter {
  const value = Array.isArray(raw) ? raw[0] : raw
  return (GRADING_FILTERS as readonly string[]).includes(value ?? '') ? (value as GradingFilter) : 'all'
}

export interface GradingAnswer {
  id: string
  content: string
  created_at: string
}

export interface GradingRow {
  studentId: string
  name: string | null
  avatarUrl: string | null
  /** Visible top-level answers, oldest first. */
  answers: GradingAnswer[]
  grade: { score: number; feedback: string | null; graded_at: string } | null
}

export type GradingStatus = 'ungraded' | 'graded' | 'unanswered'

/**
 * A graded student is 'graded' whether or not they answered (a teacher may
 * record a 0 for no participation); otherwise answered = waiting for a grade.
 */
export function gradingStatus(row: Pick<GradingRow, 'answers' | 'grade'>): GradingStatus {
  if (row.grade) return 'graded'
  return row.answers.length > 0 ? 'ungraded' : 'unanswered'
}

export function filterRoster<T extends Pick<GradingRow, 'answers' | 'grade'>>(rows: T[], filter: GradingFilter): T[] {
  if (filter === 'all') return rows
  return rows.filter((row) => gradingStatus(row) === filter)
}

const STATUS_ORDER: Record<GradingStatus, number> = { ungraded: 0, graded: 1, unanswered: 2 }

/** Waiting for a grade first, then graded, then no answer; by name within each. */
export function sortRoster<T extends Pick<GradingRow, 'answers' | 'grade' | 'name' | 'studentId'>>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const s = STATUS_ORDER[gradingStatus(a)] - STATUS_ORDER[gradingStatus(b)]
    if (s !== 0) return s
    const an = (a.name ?? '').toLocaleLowerCase()
    const bn = (b.name ?? '').toLocaleLowerCase()
    if (an !== bn) return an < bn ? -1 : 1
    return a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0
  })
}

export function rosterCounts(rows: Pick<GradingRow, 'answers' | 'grade'>[]): Record<GradingFilter, number> {
  const counts: Record<GradingFilter, number> = { all: rows.length, ungraded: 0, graded: 0, unanswered: 0 }
  for (const row of rows) counts[gradingStatus(row)]++
  return counts
}

/**
 * Maps the database's refusals (community_guard_prompt_grade / RLS) to
 * something the teacher can act on.
 */
export function gradeErrorKey(
  error: { code?: string; message?: string } | null | undefined
): 'notAllowed' | 'invalid' | null {
  if (!error) return null
  if (error.code === '42501') return 'notAllowed'
  if (error.code === '23514') return 'invalid'
  return null
}
