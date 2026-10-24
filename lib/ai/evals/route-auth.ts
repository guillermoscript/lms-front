import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { authorizeCheckpointStaff, authorizeExamStaff, authorizeExerciseStaff, authorizeLessonTaskStaff, type CheckpointTestsTarget, type ExamTestsTarget, type ExerciseTestsExercise } from './store'

export interface LessonTaskStaffContext {
  supabase: SupabaseClient
  user: User
  tenantId: string
  role: 'teacher' | 'admin'
  lesson: Awaited<ReturnType<typeof authorizeLessonTaskStaff>> extends infer R
    ? R extends { lesson: infer L } ? L : never
    : never
}

/**
 * Cookie or Bearer (MCP) auth, then staff access to the lesson. Returns a
 * response to send as-is when access is refused.
 */
export async function lessonTaskStaff(
  req: Request,
  lessonIdParam: string | number
): Promise<LessonTaskStaffContext | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const lessonId = Number(lessonIdParam)
  if (!Number.isInteger(lessonId) || lessonId <= 0) return new NextResponse('Invalid lesson id', { status: 400 })

  const access = await authorizeLessonTaskStaff(auth.supabase, { userId: auth.user.id, tenantId: auth.tenantId }, lessonId)
  if ('error' in access) return new NextResponse(access.error, { status: access.status })

  return { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId, role: access.role, lesson: access.lesson }
}

export interface ExerciseStaffContext {
  supabase: SupabaseClient
  user: User
  tenantId: string
  role: 'teacher' | 'admin'
  exercise: ExerciseTestsExercise
}

/** Cookie or Bearer (MCP) auth, then staff access to the exercise (graded types only). */
export async function exerciseStaff(
  req: Request,
  exerciseIdParam: string | number
): Promise<ExerciseStaffContext | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const exerciseId = Number(exerciseIdParam)
  if (!Number.isInteger(exerciseId) || exerciseId <= 0) return new NextResponse('Invalid exercise id', { status: 400 })

  const access = await authorizeExerciseStaff(auth.supabase, { userId: auth.user.id, tenantId: auth.tenantId }, exerciseId)
  if ('error' in access) {
    return access.error === 'unsupported_type'
      ? NextResponse.json({ error: 'unsupported_type' }, { status: 409 })
      : new NextResponse(access.error, { status: access.status })
  }
  return { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId, role: access.role, exercise: access.exercise }
}

export interface CheckpointStaffContext {
  supabase: SupabaseClient
  user: User
  tenantId: string
  role: 'teacher' | 'admin'
  checkpoint: CheckpointTestsTarget
}

/** Cookie or Bearer (MCP) auth, then staff access to the checkpoint (text-graded ones only). */
export async function checkpointStaff(
  req: Request,
  checkpointIdParam: string | number
): Promise<CheckpointStaffContext | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const checkpointId = Number(checkpointIdParam)
  if (!Number.isInteger(checkpointId) || checkpointId <= 0) return new NextResponse('Invalid checkpoint id', { status: 400 })

  const access = await authorizeCheckpointStaff(auth.supabase, { userId: auth.user.id, tenantId: auth.tenantId }, checkpointId)
  if ('error' in access) {
    return access.error === 'unsupported_type'
      ? NextResponse.json({ error: 'unsupported_type' }, { status: 409 })
      : new NextResponse(access.error, { status: access.status })
  }
  return { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId, role: access.role, checkpoint: access.checkpoint }
}

export interface ExamStaffContext {
  supabase: SupabaseClient
  user: User
  tenantId: string
  role: 'teacher' | 'admin'
  exam: ExamTestsTarget
}

/** Cookie or Bearer (MCP) auth, then staff access to the exam (teachers: their own course's). */
export async function examStaff(
  req: Request,
  examIdParam: string | number
): Promise<ExamStaffContext | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const examId = Number(examIdParam)
  if (!Number.isInteger(examId) || examId <= 0) return new NextResponse('Invalid exam id', { status: 400 })

  const access = await authorizeExamStaff(auth.supabase, { userId: auth.user.id, tenantId: auth.tenantId }, examId)
  if ('error' in access) return new NextResponse(access.error, { status: access.status })
  return { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId, role: access.role, exam: access.exam }
}

export type EvalRowContext = { supabase: SupabaseClient; user: User; tenantId: string; role: 'teacher' | 'admin' } & (
  | { targetType: 'lesson_ai_task'; lesson: LessonTaskStaffContext['lesson']; row: { id: string; target_id: number } }
  | { targetType: 'exercise'; exercise: ExerciseTestsExercise; row: { id: string; target_id: number } }
  | { targetType: 'checkpoint'; checkpoint: CheckpointTestsTarget; row: { id: string; target_id: number } }
  | { targetType: 'exam'; exam: ExamTestsTarget; row: { id: string; target_id: number } }
)

/**
 * Staff access through a case or run row of either target: RLS finds the row,
 * then the lesson or exercise it belongs to is re-checked.
 */
export async function evalStaffForRow(
  req: Request,
  table: 'ai_eval_cases' | 'ai_eval_runs',
  rowId: string
): Promise<EvalRowContext | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return new NextResponse('Invalid id', { status: 400 })

  const { data: row } = await auth.supabase
    .from(table)
    .select('id, target_id, target_type')
    .eq('id', rowId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!row) return new NextResponse('Not found', { status: 404 })

  const ctx = { userId: auth.user.id, tenantId: auth.tenantId }
  const base = { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId }
  const ref = { id: row.id, target_id: row.target_id }

  if (row.target_type === 'exercise') {
    // Existing cases and runs stay readable, editable and deletable even if the
    // exercise type changed later; only generating and running enforce the type.
    const access = await authorizeExerciseStaff(auth.supabase, ctx, row.target_id, { requireGraded: false })
    if ('error' in access) return new NextResponse(access.error, { status: access.status })
    return { ...base, role: access.role, targetType: 'exercise', exercise: access.exercise, row: ref }
  }

  if (row.target_type === 'checkpoint') {
    const access = await authorizeCheckpointStaff(auth.supabase, ctx, row.target_id, { requireGraded: false })
    if ('error' in access) return new NextResponse(access.error, { status: access.status })
    return { ...base, role: access.role, targetType: 'checkpoint', checkpoint: access.checkpoint, row: ref }
  }

  if (row.target_type === 'exam') {
    const access = await authorizeExamStaff(auth.supabase, ctx, row.target_id)
    if ('error' in access) return new NextResponse(access.error, { status: access.status })
    return { ...base, role: access.role, targetType: 'exam', exam: access.exam, row: ref }
  }

  const access = await authorizeLessonTaskStaff(auth.supabase, ctx, row.target_id)
  if ('error' in access) return new NextResponse(access.error, { status: access.status })
  return { ...base, role: access.role, targetType: 'lesson_ai_task', lesson: access.lesson, row: ref }
}
