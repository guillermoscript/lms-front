import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStructuredRequirements } from '@/lib/ai/lesson-requirements'
import type { LessonTaskConfig, LessonTaskLesson } from '@/lib/ai/lesson-task-preview'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import type { WrittenGradingExercise } from '@/lib/exercises/evaluate-written'
import { isGradedEvalExerciseType, type EvalCaseRow, type GradedCaseRow } from './schema'

type Admin = ReturnType<typeof createAdminClient>

export const CASE_COLUMNS =
  'id, kind, source, name, importance_note, expected, must_keep, input, golden_output, generated_for_version_id, teacher_edited, created_at, updated_at'

/**
 * Staff access to one lesson's AI task tests: an active teacher/admin of the
 * caller's tenant, the lesson in that tenant, and — for teachers — their own
 * course (same rule as the lesson editor's verifyCourseOwnership).
 */
export async function authorizeLessonTaskStaff(
  supabase: SupabaseClient,
  ctx: { userId: string; tenantId: string },
  lessonId: number
): Promise<{ role: 'teacher' | 'admin'; lesson: LessonTaskLesson & { id: number; course_id: number } } | { error: string; status: number }> {
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role
  if (role !== 'teacher' && role !== 'admin') return { error: 'Forbidden', status: 403 }

  const { data: lesson } = await supabase
    .from('lessons')
    .select('id, title, description, content, course_id, courses!inner(author_id, tenant_id)')
    .eq('id', lessonId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!lesson) return { error: 'Lesson not found', status: 404 }

  const course = Array.isArray(lesson.courses) ? lesson.courses[0] : lesson.courses
  if (role !== 'admin' && course?.author_id !== ctx.userId) return { error: 'Forbidden', status: 403 }

  return {
    role,
    lesson: {
      id: lesson.id,
      course_id: lesson.course_id,
      title: lesson.title ?? undefined,
      description: lesson.description ?? undefined,
      content: lesson.content ?? undefined,
    },
  }
}

/** The live task config. system_prompt is not client-readable, so this uses the service role. */
export async function loadLiveLessonTaskConfig(admin: Admin, lessonId: number, tenantId: string) {
  const { data } = await admin
    .from('lessons_ai_tasks')
    .select('task_instructions, system_prompt, requirements, lessons!inner(tenant_id)')
    .eq('lesson_id', lessonId)
    .eq('lessons.tenant_id', tenantId)
    .maybeSingle()
  if (!data) return null
  return {
    task_instructions: data.task_instructions ?? '',
    system_prompt: data.system_prompt ?? '',
    requirements: (data.requirements ?? null) as LessonTaskConfig['requirements'],
  }
}

/** Version id for a config (created when new). Caller has already verified the lesson's tenant. */
export async function ensureLessonTaskVersion(admin: Admin, lessonId: number, config: LessonTaskConfig) {
  const { data, error } = await admin.rpc('ensure_lesson_task_version', {
    _lesson_id: lessonId,
    _task_instructions: config.task_instructions ?? '',
    _system_prompt: config.system_prompt ?? '',
    // Passed verbatim: the save trigger hashes the stored row as-is, so the live
    // config must reach here unparsed to land on the same version. Drafts arrive
    // already through structuredRequirementsSchema, like the save action's.
    _requirements: (config.requirements ?? null) as never,
  })
  if (error || !data) throw new Error(`Could not record the task version: ${error?.message ?? 'no id'}`)
  return data as string
}

export function snapshotToConfig(snapshot: unknown): LessonTaskConfig {
  const s = (snapshot ?? {}) as { task_instructions?: string; system_prompt?: string; requirements?: unknown }
  return {
    task_instructions: s.task_instructions ?? '',
    system_prompt: s.system_prompt ?? '',
    requirements: parseStructuredRequirements(s.requirements),
  }
}

export function toCaseRow(row: Record<string, unknown>): EvalCaseRow {
  return row as unknown as EvalCaseRow
}

export function toGradedCaseRow(row: Record<string, unknown>): GradedCaseRow {
  return row as unknown as GradedCaseRow
}

export interface ExerciseTestsExercise {
  id: number
  title: string
  exercise_type: string
  course_id: number
}

/**
 * Staff access to one exercise's graded-answer tests: an active teacher/admin
 * of the caller's tenant, the exercise in that tenant, and — for teachers —
 * their own course (mirrors authorizeExercisePreview). Exercise types the
 * tests cannot grade are refused with 409 `unsupported_type`.
 */
export async function authorizeExerciseStaff(
  supabase: SupabaseClient,
  ctx: { userId: string; tenantId: string },
  exerciseId: number,
  opts: { requireGraded?: boolean } = {}
): Promise<{ role: 'teacher' | 'admin'; exercise: ExerciseTestsExercise } | { error: string; status: number }> {
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role
  if (role !== 'teacher' && role !== 'admin') return { error: 'Forbidden', status: 403 }

  const { data: exercise } = await supabase
    .from('exercises')
    .select('id, title, exercise_type, course_id, courses!inner(author_id, tenant_id)')
    .eq('id', exerciseId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!exercise) return { error: 'Exercise not found', status: 404 }

  const course = Array.isArray(exercise.courses) ? exercise.courses[0] : exercise.courses
  if (role !== 'admin' && course?.author_id !== ctx.userId) return { error: 'Forbidden', status: 403 }
  if ((opts.requireGraded ?? true) && !isGradedEvalExerciseType(exercise.exercise_type)) return { error: 'unsupported_type', status: 409 }

  return {
    role,
    exercise: { id: exercise.id, title: exercise.title, exercise_type: exercise.exercise_type, course_id: exercise.course_id },
  }
}

/**
 * The saved exercise exactly as the grader sees it, grading secrets merged back
 * (they are not client-readable, so this uses the service role). Pinned to the
 * tenant the caller already authorized.
 */
export async function loadGradingExercise(
  admin: Admin,
  exerciseId: number,
  tenantId: string
): Promise<(WrittenGradingExercise & { passingScore: number }) | null> {
  const { data } = await admin
    .from('exercises')
    .select(`title, instructions, system_prompt, exercise_type, exercise_config, ${GRADING_SECRETS_EMBED}`)
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data) return null
  const merged = withGradingSecrets(data as never as { exercise_config?: unknown; system_prompt?: string | null; exercise_grading_secrets?: unknown }) as {
    exercise_config?: Record<string, unknown> | null
    system_prompt?: string | null
  }
  const config = merged.exercise_config ?? {}
  return {
    title: data.title,
    instructions: data.instructions,
    system_prompt: merged.system_prompt ?? null,
    exercise_type: data.exercise_type,
    exercise_config: config,
    passingScore: typeof config.passing_score === 'number' ? Math.min(100, Math.max(0, config.passing_score)) : 70,
  }
}

/** Version id for the exercise's current grader config (created when new). Caller has verified the tenant. */
export async function ensureExerciseGraderVersion(admin: Admin, exerciseId: number) {
  const { data, error } = await admin.rpc('ensure_exercise_grader_version', { _exercise_id: exerciseId })
  if (error || !data) throw new Error(`Could not record the grader version: ${error?.message ?? 'no id'}`)
  return data as string
}
