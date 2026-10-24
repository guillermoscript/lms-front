import { NextResponse } from 'next/server'
import { checkpointStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, ensureCheckpointGraderVersion, loadCheckpointGradingExercise } from '@/lib/ai/evals/store'
import { EVAL_LIMITS } from '@/lib/ai/evals/schema'
import { draftSampleAnswers } from '@/lib/ai/evals/graded-answer-engine'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type Params = { params: Promise<{ checkpointId: string }> }

/**
 * Drafts 8 sample student answers (only when the teacher asks) and saves them
 * as generated cases, "unverified" until the teacher edits them. Adds as many
 * as fit under the case limit; 409 when none do.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await checkpointStaff(req, (await params).checkpointId)
  if (ctx instanceof NextResponse) return ctx

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'checkpoint')
    .eq('target_id', ctx.checkpoint.id)
  const room = EVAL_LIMITS.maxCasesPerTarget - (count ?? 0)
  if (room <= 0) return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })

  const admin = createAdminClient()
  const exercise = await loadCheckpointGradingExercise(admin, ctx.checkpoint.id, ctx.tenantId)
  if (!exercise) return NextResponse.json({ error: 'Checkpoint not found' }, { status: 404 })

  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'eval_generator', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      const generator = await ai.getModelForFeature('eval_generator')
      const drafted = (await draftSampleAnswers(generator.model, { exercise, passingScore: exercise.passingScore })).slice(0, room)
      const versionId = await ensureCheckpointGraderVersion(admin, ctx.checkpoint.id)

      const { data, error } = await ctx.supabase
        .from('ai_eval_cases')
        .insert(
          drafted.map((d) => ({
            tenant_id: ctx.tenantId,
            target_type: 'checkpoint',
            target_id: ctx.checkpoint.id,
            kind: 'graded_answer',
            source: 'generated',
            name: d.name,
            importance_note: d.rationale || null,
            expected: { score: d.expected_score, tolerance: 10, passed: null, category: d.category },
            input: { content: d.content },
            generated_for_version_id: versionId,
          }))
        )
        .select(CASE_COLUMNS)
      if (error) return NextResponse.json({ error: 'Could not save the samples' }, { status: 500 })
      return NextResponse.json({ cases: data ?? [] }, { status: 201 })
    }
  )
}
