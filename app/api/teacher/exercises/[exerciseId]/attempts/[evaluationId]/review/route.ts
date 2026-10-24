import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { loadGradingExercise } from '@/lib/ai/evals/store'
import { recordExerciseCompletion } from '@/lib/exercises/record-completion'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ exerciseId: string; evaluationId: string }> }

const bodySchema = z.object({
  score: z.number().int().min(0).max(100),
  feedback: z.string().trim().max(5000).default(''),
})

/**
 * A teacher regrades one AI-graded attempt. The AI score stays in `score`; the
 * teacher's grade goes next to it, and the student sees both. A passing regrade
 * completes the exercise for the student; a failing one does not undo an
 * existing completion.
 */
export async function POST(req: Request, { params }: Params) {
  const { exerciseId, evaluationId } = await params
  const ctx = await exerciseStaff(req, exerciseId, { surface: 'graded' })
  if (ctx instanceof NextResponse) return ctx

  const id = Number(evaluationId)
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid attempt id' }, { status: 400 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Read through the staff RLS policy, pinned to this exercise and tenant.
  const { data: attempt } = await ctx.supabase
    .from('exercise_evaluations')
    .select('id, user_id')
    .eq('id', id)
    .eq('exercise_id', ctx.exercise.id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle()
  if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 })

  const admin = createAdminClient()
  const exercise = await loadGradingExercise(admin, ctx.exercise.id, ctx.tenantId)
  if (!exercise) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })

  const { score, feedback } = parsed.data
  const passed = score >= exercise.passingScore
  const reviewedAt = new Date().toISOString()
  const { error } = await admin
    .from('exercise_evaluations')
    .update({
      teacher_score: score,
      teacher_passed: passed,
      teacher_feedback: feedback || null,
      teacher_id: ctx.user.id,
      reviewed_at: reviewedAt,
    })
    .eq('id', attempt.id)
    .eq('tenant_id', ctx.tenantId)
  if (error) return NextResponse.json({ error: 'Could not save the grade' }, { status: 500 })

  let completed = false
  if (passed) {
    const completion = await recordExerciseCompletion(admin, {
      exerciseId: ctx.exercise.id,
      userId: attempt.user_id,
      score,
      completedBy: ctx.user.id,
    })
    if (completion.error) return NextResponse.json({ error: 'Grade saved, but the completion was not recorded' }, { status: 500 })
    completed = completion.created
  }

  return NextResponse.json({
    review: { teacher_score: score, teacher_passed: passed, teacher_feedback: feedback || null, reviewed_at: reviewedAt },
    completed,
  })
}
