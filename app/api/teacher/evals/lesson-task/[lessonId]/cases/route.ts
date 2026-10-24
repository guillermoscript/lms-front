import { NextResponse } from 'next/server'
import { z } from 'zod'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, ensureLessonTaskVersion, loadLiveLessonTaskConfig } from '@/lib/ai/evals/store'
import { createCaseSchema, draftConfigSchema, EVAL_LIMITS, goldenOutputInputSchema } from '@/lib/ai/evals/schema'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ lessonId: string }> }

/** The lesson task's test cases (goldens + scenarios) and suite settings. */
export async function GET(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const [{ data: cases, error }, { data: suite }] = await Promise.all([
    ctx.supabase
      .from('ai_eval_cases')
      .select(CASE_COLUMNS)
      .eq('tenant_id', ctx.tenantId)
      .eq('target_type', 'lesson_ai_task')
      .eq('target_id', ctx.lesson.id)
      .order('created_at'),
    ctx.supabase
      .from('ai_eval_suites')
      .select('auto_regenerate')
      .eq('tenant_id', ctx.tenantId)
      .eq('target_type', 'lesson_ai_task')
      .eq('target_id', ctx.lesson.id)
      .maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: 'Could not load test cases' }, { status: 500 })

  return NextResponse.json({ cases: cases ?? [], suite: { auto_regenerate: suite?.auto_regenerate ?? true } })
}

/**
 * Save a case. A golden chat from the preview also records what happened
 * (completed, at which student turn) and the version it ran on: the live
 * config, or the editor's unsaved draft when `draft` is sent.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const body = await req.json().catch(() => null)
  const parsed = createCaseSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid case', issues: parsed.error.issues }, { status: 400 })
  const input = parsed.data

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'lesson_ai_task')
    .eq('target_id', ctx.lesson.id)
  if ((count ?? 0) >= EVAL_LIMITS.maxCasesPerTarget) {
    return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })
  }

  let goldenOutput: Record<string, unknown> | null = null
  if (input.kind === 'golden_chat') {
    const extras = z
      .object({ golden_output: goldenOutputInputSchema.optional(), draft: draftConfigSchema.optional() })
      .safeParse(body)
    if (!extras.success) return NextResponse.json({ error: 'Invalid golden output' }, { status: 400 })
    const completed = extras.data.golden_output?.completed ?? false
    const completedTurn = completed ? (extras.data.golden_output?.completed_turn ?? null) : null
    // Which version produced it: the editor's draft if sent, else the live task.
    const admin = createAdminClient()
    const config = extras.data.draft ?? (await loadLiveLessonTaskConfig(admin, ctx.lesson.id, ctx.tenantId))
    const versionId = config ? await ensureLessonTaskVersion(admin, ctx.lesson.id, config).catch(() => null) : null
    goldenOutput = { completed, completed_turn: completedTurn, version_id: versionId }
  }

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'lesson_ai_task',
      target_id: ctx.lesson.id,
      kind: input.kind,
      source: input.kind === 'golden_chat' ? input.source : 'teacher',
      name: input.name,
      importance_note: input.importance_note ?? null,
      expected: input.expected,
      must_keep: input.must_keep,
      input: input.input,
      golden_output: goldenOutput as never,
    })
    .select(CASE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: 'Could not save the case' }, { status: 500 })

  return NextResponse.json({ case: data }, { status: 201 })
}
