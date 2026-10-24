import { NextResponse } from 'next/server'
import { z } from 'zod'
import { lessonTaskStaff } from '@/lib/ai/evals/route-auth'
import { CASE_COLUMNS, ensureLessonTaskVersion, loadLiveLessonTaskConfig } from '@/lib/ai/evals/store'
import { draftConfigSchema, EVAL_LIMITS } from '@/lib/ai/evals/schema'
import { draftScenarios } from '@/lib/ai/evals/lesson-task-engine'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 120

type Params = { params: Promise<{ lessonId: string }> }

const bodySchema = z
  .object({
    draft: draftConfigSchema.optional(),
    count: z.number().int().min(1).max(4).default(4),
  })
  .default({ count: 4 })

/**
 * Drafts simulated students for the task (only when the teacher asks) and
 * saves them as generated scenarios. Generated scenarios the teacher has not
 * edited are replaced, so pressing it again regenerates rather than piling up.
 */
export async function POST(req: Request, { params }: Params) {
  const ctx = await lessonTaskStaff(req, (await params).lessonId)
  if (ctx instanceof NextResponse) return ctx

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const admin = createAdminClient()
  const config = parsed.data.draft ?? (await loadLiveLessonTaskConfig(admin, ctx.lesson.id, ctx.tenantId))
  if (!config) return NextResponse.json({ error: 'no_task' }, { status: 409 })

  const { data: existing } = await ctx.supabase
    .from('ai_eval_cases')
    .select('id, source, teacher_edited')
    .eq('tenant_id', ctx.tenantId)
    .eq('target_type', 'lesson_ai_task')
    .eq('target_id', ctx.lesson.id)
  const replaceable = (existing ?? []).filter((c) => c.source === 'generated' && !c.teacher_edited)
  const room = EVAL_LIMITS.maxCasesPerTarget - ((existing?.length ?? 0) - replaceable.length)
  const count = Math.min(parsed.data.count, room)
  if (count <= 0) return NextResponse.json({ error: 'case_limit', limit: EVAL_LIMITS.maxCasesPerTarget }, { status: 409 })

  return withTenantAi(
    { tenantId: ctx.tenantId, feature: 'eval_generator', canConfigure: ctx.role === 'admin', actorId: ctx.user.id },
    async (ai) => {
      const generator = await ai.getModelForFeature('eval_generator')
      const drafted = await draftScenarios(generator.model, { lesson: ctx.lesson, config, count })
      const versionId = await ensureLessonTaskVersion(admin, ctx.lesson.id, config)

      if (replaceable.length > 0) {
        await ctx.supabase
          .from('ai_eval_cases')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .in('id', replaceable.map((c) => c.id))
      }
      const { data, error } = await ctx.supabase
        .from('ai_eval_cases')
        .insert(
          drafted.map((d) => ({
            tenant_id: ctx.tenantId,
            target_type: 'lesson_ai_task',
            target_id: ctx.lesson.id,
            kind: 'scenario',
            source: 'generated',
            name: d.name,
            expected: d.expected,
            must_keep: d.must_keep,
            input: d.input,
            generated_for_version_id: versionId,
          }))
        )
        .select(CASE_COLUMNS)
      if (error) return NextResponse.json({ error: 'Could not save the scenarios' }, { status: 500 })

      // Generating is opting in: keep regenerating them when the task changes.
      await ctx.supabase
        .from('ai_eval_suites')
        .upsert(
          { tenant_id: ctx.tenantId, target_type: 'lesson_ai_task', target_id: ctx.lesson.id },
          { onConflict: 'target_type,target_id', ignoreDuplicates: true }
        )

      return NextResponse.json({ cases: data ?? [] }, { status: 201 })
    }
  )
}
