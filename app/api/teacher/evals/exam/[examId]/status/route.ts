import { NextResponse } from 'next/server'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { ensureExamGraderVersion, loadPublishTestStatus } from '@/lib/ai/evals/store'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ examId: string }> }

/** Whether the saved exam has grading tests that never ran on its current version (the Publish warning). */
export async function GET(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  const status = await loadPublishTestStatus(ctx.supabase, { tenantId: ctx.tenantId, type: 'exam', id: ctx.exam.id }, () =>
    ensureExamGraderVersion(createAdminClient(), ctx.exam.id)
  )
  return NextResponse.json(status)
}
