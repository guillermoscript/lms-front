import { NextResponse } from 'next/server'
import { z } from 'zod'
import { exerciseStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, defaultSurfaceForType, ensureExerciseGraderVersion, loadGradingExercise, loadScenarioExercise } from '@/lib/ai/evals/store'
import { EVAL_LIMITS, EXERCISE_EVAL_SURFACES } from '@/lib/ai/evals/schema'
import { draftSampleAnswers } from '@/lib/ai/evals/graded-answer-engine'
import { draftCoachScenarios } from '@/lib/ai/evals/coach-engine'
import { draftVoiceScenarios } from '@/lib/ai/evals/voice-engine'
import { hasPlanFeature } from '@/lib/plans/server'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type Params = { params: Promise<{ exerciseId: string }> }

const bodySchema = z.object({ surface: z.enum(EXERCISE_EVAL_SURFACES).optional() })

/**
 * Drafts test cases (only when the teacher asks) and saves them as generated
 * cases, "unverified" until the teacher edits them. `{surface}` picks what (default: by exercise type):
 * graded (8 sample answers), coach (ideal / confused / cheater /
 * minimal-effort students) or voice (on-level / one-word / language-switcher /
 * grader-injection students). Adds as many as fit under the case limit; 409
 * when none do.
 */
export async function POST(req: Request, { params }: Params) {
  const raw = await req.json().catch(() => ({}))
  const body = bodySchema.safeParse(raw ?? {})
  // No surface named: the exercise type picks one (graded, voice or coach).
  const requested = body.success ? body.data.surface : undefined
  const ctx = await exerciseStaff(req, (await params).exerciseId, { surface: requested ?? 'any' })
  if (ctx instanceof NextResponse) return ctx
  if (!body.success) return NextResponse.json({ error: 'invalid', issues: body.error.issues }, { status: 400 })
  const surface = requested ?? defaultSurfaceForType(ctx.exercise.exercise_type)
  if (!surface) return NextResponse.json({ error: 'unsupported_type' }, { status: 409 })

  // Voice tests spend the same plan feature as the production voice route.
  if (surface === 'voice' && !(await hasPlanFeature(ctx.tenantId, 'voice_exercises'))) {
    return NextResponse.json({ error: 'plan_required' }, { status: 402 })
  }

  const { count } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'exercise')
    .eq('target_id', ctx.exercise.id)
  const room = EVAL_LIMITS.maxCasesPerTarget - (count ?? 0)
  if (room <= 0) return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })

  const admin = createAdminClient()

  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'eval_generator', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      const base = { tenant_id: ctx.tenantId, target_type: 'exercise', target_id: ctx.exercise.id, source: 'generated' }
      const save = async (rows: Record<string, unknown>[]) => {
        const { data, error } = await ctx.supabase.from('ai_eval_cases').insert(rows as never).select(CASE_COLUMNS)
        if (error) return NextResponse.json({ error: 'Could not save the samples' }, { status: 500 })
        return NextResponse.json({ cases: data ?? [] }, { status: 201 })
      }

      if (surface === 'graded') {
        const exercise = await loadGradingExercise(admin, ctx.exercise.id, ctx.tenantId)
        if (!exercise) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
        const generator = await ai.getModelForFeature('eval_generator')
        const drafted = (await draftSampleAnswers(generator.model, { exercise, passingScore: exercise.passingScore })).slice(0, room)
        const versionId = await ensureExerciseGraderVersion(admin, ctx.exercise.id)
        return save(
          drafted.map((d) => ({
            ...base,
            kind: 'graded_answer',
            name: d.name,
            importance_note: d.rationale || null,
            expected: { score: d.expected_score, tolerance: 10, passed: null, category: d.category },
            input: { content: d.content },
            generated_for_version_id: versionId,
          }))
        )
      }

      const exercise = await loadScenarioExercise(admin, ctx.exercise.id, ctx.tenantId)
      if (!exercise) return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
      const generator = await ai.getModelForFeature('eval_generator')

      if (surface === 'coach') {
        const drafted = (await draftCoachScenarios(generator.model, { exercise })).slice(0, room)
        const versionId = await ensureExerciseGraderVersion(admin, ctx.exercise.id)
        return save(
          drafted.map((d) => ({
            ...base,
            kind: 'coach_scenario',
            name: d.name,
            expected: d.expected,
            must_keep: d.must_keep,
            input: d.input,
            generated_for_version_id: versionId,
          }))
        )
      }

      const drafted = (await draftVoiceScenarios(generator.model, { exercise, config: exercise.conversation })).slice(0, room)
      const versionId = await ensureExerciseGraderVersion(admin, ctx.exercise.id)
      return save(
        drafted.map((d) => ({
          ...base,
          kind: 'voice_scenario',
          name: d.name,
          expected: d.expected,
          must_keep: d.must_keep,
          input: d.input,
          generated_for_version_id: versionId,
        }))
      )
    }
  )
}
