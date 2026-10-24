import 'server-only'
import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { authorizeLessonTaskStaff } from './store'

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

/** Staff access through a case or run row: RLS finds the row, then the lesson is re-checked. */
export async function lessonTaskStaffForRow(
  req: Request,
  table: 'ai_eval_cases' | 'ai_eval_runs',
  rowId: string
): Promise<(LessonTaskStaffContext & { row: { id: string; target_id: number } }) | NextResponse> {
  const auth = await getApiAuthContext(req)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(rowId)) return new NextResponse('Invalid id', { status: 400 })

  const { data: row } = await auth.supabase
    .from(table)
    .select('id, target_id')
    .eq('id', rowId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!row) return new NextResponse('Not found', { status: 404 })

  const access = await authorizeLessonTaskStaff(auth.supabase, { userId: auth.user.id, tenantId: auth.tenantId }, row.target_id)
  if ('error' in access) return new NextResponse(access.error, { status: access.status })

  return { supabase: auth.supabase, user: auth.user, tenantId: auth.tenantId, role: access.role, lesson: access.lesson, row }
}
