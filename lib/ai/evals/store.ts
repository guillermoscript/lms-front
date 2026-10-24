import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStructuredRequirements } from '@/lib/ai/lesson-requirements'
import type { LessonTaskConfig, LessonTaskLesson } from '@/lib/ai/lesson-task-preview'
import type { EvalCaseRow } from './schema'

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
