import { NextResponse } from 'next/server'
import { examStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, ensureExamGraderVersion } from '@/lib/ai/evals/store'
import { EVAL_LIMITS } from '@/lib/ai/evals/schema'
import { draftExamAnswers } from '@/lib/ai/evals/exam-engine'
import { loadExamGradingContext } from '@/lib/exams/grade'
import { hasPlanFeature } from '@/lib/plans/server'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type Params = { params: Promise<{ examId: string }> }

/**
 * Drafts sample answer sheets (strong / mixed / weak / injection; only when the
 * teacher asks) and saves them as generated cases, "unverified" until the
 * teacher edits them. Adds as many as fit under the case limit; 409 when none do.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await examStaff(req, (await params).examId)
  if (ctx instanceof NextResponse) return ctx

  if (!(await hasPlanFeature(ctx.tenantId, 'ai_grading'))) {
    return NextResponse.json({ error: 'plan_required' }, { status: 402 })
  }

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exam')
    .eq('target_id', ctx.exam.id)
  const room = EVAL_LIMITS.maxCasesPerTarget - (count ?? 0)
  if (room <= 0) return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })

  const admin = createAdminClient()
  const exam = await loadExamGradingContext(admin, { examId: ctx.exam.id, tenantId: ctx.tenantId })
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
  if (!exam.questions.some((q) => q.question_type === 'free_text')) {
    return NextResponse.json({ error: 'no_ai_questions' }, { status: 409 })
  }

  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'eval_generator', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      const generator = await ai.getModelForFeature('eval_generator')
      const drafted = (await draftExamAnswers(generator.model, { exam })).slice(0, room)
      if (drafted.length === 0) return NextResponse.json({ error: 'no_samples' }, { status: 502 })
      const versionId = await ensureExamGraderVersion(admin, ctx.exam.id)

      const { data, error } = await ctx.supabase
        .from('ai_eval_cases')
        .insert(
          drafted.map((d) => ({
            tenant_id: ctx.tenantId,
            target_type: 'exam',
            target_id: ctx.exam.id,
            kind: 'graded_exam',
            source: 'generated',
            name: d.name,
            importance_note: d.rationale || null,
            expected: d.expected,
            input: { answers: d.answers },
            generated_for_version_id: versionId,
          }))
        )
        .select(CASE_COLUMNS)
      if (error) return NextResponse.json({ error: 'Could not save the samples' }, { status: 500 })
      return NextResponse.json({ cases: data ?? [] }, { status: 201 })
    }
  )
}
