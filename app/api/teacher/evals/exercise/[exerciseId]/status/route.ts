import { NextResponse } from 'next/server'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { ensureExerciseGraderVersion, loadPublishTestStatus } from '@/lib/ai/evals/store'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ exerciseId: string }> }

/** Whether the saved exercise has tests that never ran on its current version (the Publish warning). */
export async function GET(req: Request, { params }: Params) {
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: 'any' })
  if (ctx instanceof NextResponse) return ctx

  const status = await loadPublishTestStatus(ctx.supabase, { tenantId: ctx.tenantId, type: 'exercise', id: ctx.exercise.id }, () =>
    ensureExerciseGraderVersion(createAdminClient(), ctx.exercise.id)
  )
  return NextResponse.json(status)
}
