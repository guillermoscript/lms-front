import { NextResponse } from 'next/server'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'
import { ensureLessonTaskVersion, loadLiveLessonTaskConfig, loadPublishTestStatus } from '@/lib/ai/evals/store'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ lessonId: string }> }

/** Whether the lesson's saved AI task has tests that never ran on its current version (the Publish warning). */
export async function GET(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const status = await loadPublishTestStatus(ctx.supabase, { tenantId: ctx.tenantId, type: 'lesson_ai_task', id: ctx.lesson.id }, async () => {
    const admin = createAdminClient()
    const config = await loadLiveLessonTaskConfig(admin, ctx.lesson.id, ctx.tenantId)
    return config ? ensureLessonTaskVersion(admin, ctx.lesson.id, config) : null
  })
  return NextResponse.json(status)
}
