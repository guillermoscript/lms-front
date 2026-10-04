/**
 * A lesson's checkpoints, client-safe — `GET /api/lessons/:lessonId/checkpoints`
 *
 * The web lesson page builds this list inside its server component
 * (`loadLessonCheckpoints`). A native client has no server page, so it read
 * `lesson_checkpoints` + `exercises` under RLS and mirrored the parsers on the
 * device (#829, guillermoscript/lms-app#20). This hands it the exact list the
 * web renders: same loader, same entitlement gate, questions without answers.
 *
 * Cookie or Bearer via `getApiAuthContext`. The loader reads with the admin
 * client (it merges the answer key to parse, then strips it), so the gate is
 * explicit here, as on the lesson page (#509/#532).
 */

import { NextResponse } from 'next/server'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCourseAccessState } from '@/lib/services/course-access'
import { loadLessonCheckpoints } from '@/lib/checkpoints/load'

export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const auth = await getApiAuthContext(request)
  if (!auth) return new NextResponse('Unauthorized', { status: 401 })

  const lessonId = Number.parseInt((await params).lessonId, 10)
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return NextResponse.json({ error: 'Invalid lesson id' }, { status: 400 })
  }

  const adminClient = createAdminClient()
  const { data: lesson } = await adminClient
    .from('lessons')
    .select('id, course_id')
    .eq('id', lessonId)
    .eq('tenant_id', auth.tenantId)
    .maybeSingle()
  if (!lesson) {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }

  const accessState = await resolveCourseAccessState(adminClient, auth.user.id, lesson.course_id)
  if (accessState !== 'granted') {
    return NextResponse.json(
      {
        error:
          accessState === 'suspended'
            ? "Your school's access is currently suspended"
            : 'You do not have access to this course',
        accessDenied: true,
        accessSuspended: accessState === 'suspended',
      },
      { status: 403 }
    )
  }

  const checkpoints = await loadLessonCheckpoints(adminClient, {
    tenantId: auth.tenantId,
    lessonId,
    userId: auth.user.id,
  })
  return NextResponse.json(
    checkpoints,
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
}
