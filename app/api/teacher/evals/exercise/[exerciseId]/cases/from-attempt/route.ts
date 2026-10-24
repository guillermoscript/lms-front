import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { savedCaseError } from '@/lib/ai/evals/route-responses'
import { CASE_COLUMNS } from '@/lib/ai/evals/store'
import { DEFAULT_GRADED_TOLERANCE, EVAL_LIMITS, gradedInputSchema } from '@/lib/ai/evals/schema'

type Params = { params: Promise<{ exerciseId: string }> }

const bodySchema = z.object({
  evaluation_id: z.number().int().positive(),
  name: z.string().trim().min(1).max(200),
})

/**
 * Save a student's attempt that a teacher regraded as a graded_answer test:
 * the answer as submitted, expected to get the teacher's score. The case keeps
 * no link to the student or the attempt.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: 'graded' })
  if (ctx instanceof NextResponse) return ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: attempt } = await ctx.supabase
    .from('exercise_evaluations')
    .select('submission_text, submission_metadata, teacher_score')
    .eq('id', parsed.data.evaluation_id)
    .eq('exercise_id', ctx.exercise.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })
  if (attempt.teacher_score === null) return NextResponse.json({ error: 'not_reviewed' }, { status: 409 })
  if (!attempt.submission_text) return NextResponse.json({ error: 'no_answer' }, { status: 409 })

  const input = gradedInputSchema.safeParse({
    content: attempt.submission_text,
    ...(attempt.submission_metadata && typeof attempt.submission_metadata === 'object' ? { metadata: attempt.submission_metadata } : {}),
  })
  if (!input.success) return NextResponse.json({ error: 'answer_too_large' }, { status: 400 })

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
  if ((count ?? 0) >= EVAL_LIMITS.maxCasesPerTarget) return savedCaseError('case_limit')

  const { data, error } = await ctx.supabase
    .from('ai_eval_cases')
    .insert({
      tenant_id: ctx.tenantId,
      target_type: 'exercise',
      target_id: ctx.exercise.id,
      kind: 'graded_answer',
      source: 'submission',
      name: parsed.data.name,
      importance_note: null,
      // passed: null = derived from the exercise's passing score at run time.
      expected: { score: Math.round(Number(attempt.teacher_score)), tolerance: DEFAULT_GRADED_TOLERANCE, passed: null, category: 'custom' },
      input: input.data as never,
    })
    .select(CASE_COLUMNS)
    .single()
  if (error || !data) return savedCaseError('save_failed')
  return NextResponse.json({ case: data }, { status: 201 })
}
