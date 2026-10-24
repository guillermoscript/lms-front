import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStructuredRequirements } from '@/lib/ai/lesson-requirements'
import type { LessonTaskConfig, LessonTaskLesson } from '@/lib/ai/lesson-task-preview'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import type { WrittenGradingExercise } from '@/lib/exercises/evaluate-written'
import { CLOSED_EXERCISE_TYPES, EXTERNAL_EXERCISE_TYPES, parseCheckpointQuestions } from '@/lib/checkpoints/types'
import { checkpointPassingScore } from '@/lib/checkpoints/grade-checkpoint-answer'
import { parseConversationConfig, type ConversationConfig } from '@/lib/speech/conversation'
import { isGradedEvalExerciseType, type CoachCaseRow, type EvalCaseRow, type ExamCaseRow, type ExerciseEvalSurface, type GradedCaseRow, type VoiceCaseRow } from './schema'

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

export function toCoachCaseRow(row: Record<string, unknown>): CoachCaseRow {
  return row as unknown as CoachCaseRow
}

export function toVoiceCaseRow(row: Record<string, unknown>): VoiceCaseRow {
  return row as unknown as VoiceCaseRow
}

/** Whether an exercise type has a test surface: graded answers, coach chat or voice call. */
export function exerciseSurfaceFits(surface: ExerciseEvalSurface, exerciseType: string): boolean {
  if (surface === 'graded') return isGradedEvalExerciseType(exerciseType)
  if (surface === 'voice') return exerciseType === 'real_time_conversation'
  // The coach chat serves the exercise types without a dedicated flow.
  return !(EXTERNAL_EXERCISE_TYPES as readonly string[]).includes(exerciseType)
}

/** The surface a case kind belongs to. */
export function surfaceOfKind(kind: string): ExerciseEvalSurface | null {
  if (kind === 'graded_answer') return 'graded'
  if (kind === 'coach_scenario') return 'coach'
  if (kind === 'voice_scenario') return 'voice'
  return null
}

/** The surface used when a request names none. */
export function defaultSurfaceForType(exerciseType: string): ExerciseEvalSurface | null {
  if (isGradedEvalExerciseType(exerciseType)) return 'graded'
  if (exerciseType === 'real_time_conversation') return 'voice'
  return exerciseSurfaceFits('coach', exerciseType) ? 'coach' : null
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
  /**
   * `surface` names the test surface the call is for (default 'graded', the
   * pre-F4 behaviour); a type the surface cannot serve is refused with 409
   * `unsupported_type`. `'any'` accepts a type if some surface serves it,
   * `null` skips the check.
   */
  opts: { surface?: ExerciseEvalSurface | 'any' | null } = {}
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
  const surface = opts.surface === undefined ? 'graded' : opts.surface
  if (surface === 'any') {
    if (!(['graded', 'coach', 'voice'] as const).some((s) => exerciseSurfaceFits(s, exercise.exercise_type))) {
      return { error: 'unsupported_type', status: 409 }
    }
  } else if (surface !== null && !exerciseSurfaceFits(surface, exercise.exercise_type)) {
    return { error: 'unsupported_type', status: 409 }
  }

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

export interface CheckpointTestsTarget {
  id: number
  lesson_id: number
  exercise_id: number
  course_id: number
  title: string
  exercise_type: string
}

/** Checkpoint text grading applies to open-text exercises (or closed ones saved without questions). */
export function checkpointAcceptsText(exerciseType: string, config: unknown): boolean {
  return (
    exerciseType === 'essay' ||
    exerciseType === 'discussion' ||
    ((CLOSED_EXERCISE_TYPES as readonly string[]).includes(exerciseType) && !parseCheckpointQuestions((config ?? {}) as Record<string, unknown>))
  )
}

/**
 * Staff access to one checkpoint's graded-answer tests: an active
 * teacher/admin of the caller's tenant, the checkpoint in that tenant, and —
 * for teachers — the author of the linked exercise's course. Checkpoints the
 * text grader never runs on are refused with 409 `unsupported_type`.
 */
export async function authorizeCheckpointStaff(
  supabase: SupabaseClient,
  ctx: { userId: string; tenantId: string },
  checkpointId: number,
  opts: { requireGraded?: boolean } = {}
): Promise<{ role: 'teacher' | 'admin'; checkpoint: CheckpointTestsTarget } | { error: string; status: number }> {
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role
  if (role !== 'teacher' && role !== 'admin') return { error: 'Forbidden', status: 403 }

  const { data: checkpoint } = await supabase
    .from('lesson_checkpoints')
    .select('id, lesson_id, exercise_id, exercises!inner(title, exercise_type, exercise_config, course_id, tenant_id, courses!inner(author_id, tenant_id))')
    .eq('id', checkpointId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!checkpoint) return { error: 'Checkpoint not found', status: 404 }

  const exercise = Array.isArray(checkpoint.exercises) ? checkpoint.exercises[0] : checkpoint.exercises
  if (!exercise || exercise.tenant_id !== ctx.tenantId) return { error: 'Checkpoint not found', status: 404 }
  const course = Array.isArray(exercise.courses) ? exercise.courses[0] : exercise.courses
  if (role !== 'admin' && course?.author_id !== ctx.userId) return { error: 'Forbidden', status: 403 }
  if ((opts.requireGraded ?? true) && !checkpointAcceptsText(exercise.exercise_type, exercise.exercise_config)) {
    return { error: 'unsupported_type', status: 409 }
  }

  return {
    role,
    checkpoint: {
      id: checkpoint.id,
      lesson_id: checkpoint.lesson_id,
      exercise_id: checkpoint.exercise_id,
      course_id: exercise.course_id,
      title: exercise.title,
      exercise_type: exercise.exercise_type,
    },
  }
}

/**
 * The checkpoint's linked exercise exactly as the checkpoint grader sees it,
 * grading secrets merged back (service role), pinned to the authorized tenant.
 */
export async function loadCheckpointGradingExercise(
  admin: Admin,
  checkpointId: number,
  tenantId: string
): Promise<(WrittenGradingExercise & { passingScore: number }) | null> {
  const { data } = await admin
    .from('lesson_checkpoints')
    .select(`id, exercises!inner(title, instructions, system_prompt, exercise_type, exercise_config, tenant_id, ${GRADING_SECRETS_EMBED})`)
    .eq('id', checkpointId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const row = data?.exercises ? (Array.isArray(data.exercises) ? data.exercises[0] : data.exercises) : null
  if (!row || (row as { tenant_id: string }).tenant_id !== tenantId) return null
  const merged = withGradingSecrets(row as never as { exercise_config?: unknown; system_prompt?: string | null; exercise_grading_secrets?: unknown }) as {
    exercise_config?: Record<string, unknown> | null
    system_prompt?: string | null
  }
  const config = merged.exercise_config ?? {}
  const exercise = row as unknown as { title: string; instructions: string; exercise_type: string }
  return {
    title: exercise.title,
    instructions: exercise.instructions,
    system_prompt: merged.system_prompt ?? null,
    exercise_type: exercise.exercise_type,
    exercise_config: config,
    passingScore: Math.min(100, Math.max(0, checkpointPassingScore(config))),
  }
}

/** Version id for the checkpoint's current grader config (created when new). Caller has verified the tenant. */
export async function ensureCheckpointGraderVersion(admin: Admin, checkpointId: number) {
  const { data, error } = await admin.rpc('ensure_checkpoint_grader_version', { _checkpoint_id: checkpointId })
  if (error || !data) throw new Error(`Could not record the grader version: ${error?.message ?? 'no id'}`)
  return data as string
}

export interface ExamTestsTarget {
  id: number
  course_id: number
  title: string
}

/**
 * Staff access to one exam's grader tests: an active teacher/admin of the
 * caller's tenant, the exam in that tenant, and — for teachers — the author of
 * the exam's course (the same rule as the exam builder).
 */
export async function authorizeExamStaff(
  supabase: SupabaseClient,
  ctx: { userId: string; tenantId: string },
  examId: number
): Promise<{ role: 'teacher' | 'admin'; exam: ExamTestsTarget } | { error: string; status: number }> {
  const { data: membership } = await supabase
    .from('tenant_users')
    .select('role')
    .eq('user_id', ctx.userId)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role
  if (role !== 'teacher' && role !== 'admin') return { error: 'Forbidden', status: 403 }

  const { data: exam } = await supabase
    .from('exams')
    .select('exam_id, title, course_id, courses!inner(author_id, tenant_id)')
    .eq('exam_id', examId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!exam) return { error: 'Exam not found', status: 404 }

  const course = Array.isArray(exam.courses) ? exam.courses[0] : exam.courses
  if (!course || course.tenant_id !== ctx.tenantId) return { error: 'Exam not found', status: 404 }
  if (role !== 'admin' && course.author_id !== ctx.userId) return { error: 'Forbidden', status: 403 }

  return { role, exam: { id: exam.exam_id, title: exam.title, course_id: exam.course_id } }
}

/** A question as the case editor and validators see it: structure only, never the key. */
export interface ExamQuestionMeta {
  question_id: number
  question_type: string
  points: number
  option_ids: number[]
}

/**
 * The exam's question ids, types, points and option ids, with no key material
 * (the staff-only secrets are not selected). Read through the caller's RLS
 * client and pinned to the tenant through the exam.
 */
export async function loadExamQuestionsForCases(
  supabase: SupabaseClient,
  examId: number,
  tenantId: string
): Promise<ExamQuestionMeta[]> {
  const { data } = await supabase
    .from('exam_questions')
    .select('question_id, question_type, points, options:question_options(option_id), exams!inner(tenant_id)')
    .eq('exam_id', examId)
    .eq('exams.tenant_id', tenantId)
    .order('question_id')
  return (data ?? []).map((q) => ({
    question_id: q.question_id,
    question_type: q.question_type,
    points: q.points || 10,
    option_ids: ((q.options ?? []) as { option_id: number }[]).map((o) => o.option_id),
  }))
}

/** Version id for the exam's current grader config (created when new). Caller has verified the tenant. */
export async function ensureExamGraderVersion(admin: Admin, examId: number) {
  const { data, error } = await admin.rpc('ensure_exam_grader_version', { _exam_id: examId })
  if (error || !data) throw new Error(`Could not record the grader version: ${error?.message ?? 'no id'}`)
  return data as string
}

export function toExamCaseRow(row: Record<string, unknown>): ExamCaseRow {
  return row as unknown as ExamCaseRow
}

export interface ScenarioExercise {
  title: string
  description: string
  instructions: string
  system_prompt: string | null
  exercise_type: string
  exercise_config: Record<string, unknown>
  /** Parsed voice config (only meaningful for real_time_conversation). */
  conversation: ConversationConfig
  passingScore: number
}

/**
 * The saved exercise as the coach / voice tutor sees it, grading secrets
 * merged back (service role), pinned to the authorized tenant. Includes
 * `description`, which the coach prompt shows.
 */
export async function loadScenarioExercise(admin: Admin, exerciseId: number, tenantId: string): Promise<ScenarioExercise | null> {
  const { data } = await admin
    .from('exercises')
    .select(`title, description, instructions, system_prompt, exercise_type, exercise_config, ${GRADING_SECRETS_EMBED}`)
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!data) return null
  const merged = withGradingSecrets(data as never as { exercise_config?: unknown; system_prompt?: string | null; exercise_grading_secrets?: unknown }) as {
    exercise_config?: Record<string, unknown> | null
    system_prompt?: string | null
  }
  const config = merged.exercise_config ?? {}
  const conversation = parseConversationConfig(config)
  return {
    title: data.title,
    description: (data as { description?: string | null }).description ?? '',
    instructions: data.instructions ?? '',
    system_prompt: merged.system_prompt ?? null,
    exercise_type: data.exercise_type,
    exercise_config: config,
    conversation,
    passingScore: data.exercise_type === 'real_time_conversation' ? conversation.passing_score : typeof config.passing_score === 'number' ? Math.min(100, Math.max(0, config.passing_score)) : 70,
  }
}
