import { NextResponse } from 'next/server'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'

type Params = { params: Promise<{ lessonId: string }> }

/** Real student usage per task version: no model calls, plain SQL over the chat log. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const { data, error } = await ctx.supabase.rpc('lesson_task_version_metrics', { _lesson_id: ctx.lesson.id })
  if (error) return NextResponse.json({ error: 'Could not load metrics' }, { status: 500 })
  return NextResponse.json({ versions: data ?? [] })
}
