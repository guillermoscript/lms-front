import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { findStoredLessonCompletion } from '@/lib/ai/lesson-task-history'
import { NextResponse } from 'next/server'

/**
 * Teacher-facing audit for one student's AI-tutor lesson: the completion the
 * tutor granted (feedback + the verifier's per-requirement check), if any
 * (#805, follow-up to #804 — "a teacher cannot see WHY a lesson was
 * completed").
 *
 * RLS on `lessons_ai_task_messages` (20260920150000) already scopes reads to
 * a teacher/admin of the lesson's tenant; the membership check below exists
 * for a clean 403 instead of a silent empty result, same as
 * `/api/teacher/preview/lesson-task` (tenant_users is the authoritative role
 * source — CLAUDE.md, #649).
 */

export async function GET(req: Request, { params }: { params: Promise<{ lessonId: string }> }) {
    const auth = await getApiAuthContext(req)
    if (!auth) return new NextResponse('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const { lessonId } = await params
    const lessonIdNum = Number(lessonId)
    if (!Number.isInteger(lessonIdNum) || lessonIdNum <= 0) {
        return new NextResponse('Invalid lesson id', { status: 400 })
    }

    const studentId = new URL(req.url).searchParams.get('studentId')
    if (!studentId) return new NextResponse('studentId is required', { status: 400 })

    const { data: membership } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
        .maybeSingle()
    if (membership?.role !== 'teacher' && membership?.role !== 'admin') {
        return new NextResponse('Forbidden', { status: 403 })
    }

    // lessons_ai_task_messages has no tenant_id (CLAUDE.md) — scope through
    // the lesson row, same as the RLS policy does.
    const { data: lesson } = await supabase
        .from('lessons')
        .select('id')
        .eq('id', lessonIdNum)
        .eq('tenant_id', tenantId)
        .maybeSingle()
    if (!lesson) return new NextResponse('Lesson not found', { status: 404 })

    const { data: rows, error } = await supabase
        .from('lessons_ai_task_messages')
        .select('tool_invocations, created_at')
        .eq('lesson_id', lessonIdNum)
        .eq('user_id', studentId)
        .not('tool_invocations', 'is', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Failed to read lesson AI task messages for audit:', error)
        return new NextResponse('Failed to load audit', { status: 500 })
    }

    return NextResponse.json({ completion: findStoredLessonCompletion(rows ?? []) })
}
