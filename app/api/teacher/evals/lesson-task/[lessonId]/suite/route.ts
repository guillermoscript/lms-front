import { NextResponse } from 'next/server'
import { z } from 'zod'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'

type Params = { params: Promise<{ lessonId: string }> }

const bodySchema = z.object({ auto_regenerate: z.boolean() })

/** "Regenerate scenarios when the task changes" toggle. */
export async function PATCH(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { error } = await ctx.supabase
    .from('ai_eval_suites')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        target_type: 'lesson_ai_task',
        target_id: ctx.lesson.id,
        auto_regenerate: parsed.data.auto_regenerate,
      },
      { onConflict: 'target_type,target_id' }
    )
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  return NextResponse.json({ suite: { auto_regenerate: parsed.data.auto_regenerate } })
}
