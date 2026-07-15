import { z } from 'zod'
import { generateObject } from 'ai'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { AI_MODELS } from '@/lib/ai/config'
import { gradeCheckpointQuestions } from '@/lib/checkpoints/grading'
import {
  CLOSED_EXERCISE_TYPES,
  EXTERNAL_EXERCISE_TYPES,
  evaluatorTypeForExternal,
  parseCheckpointQuestions,
  type CheckpointAttemptResult,
  type CheckpointEvaluatorType,
} from '@/lib/checkpoints/types'

export const maxDuration = 60

const bodySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('answers'),
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1).max(100),
          value: z.union([z.string().max(2000), z.number(), z.boolean()]),
        })
      )
      .min(1)
      .max(50),
  }),
  z.object({ kind: z.literal('text'), text: z.string().min(1).max(8000) }),
  // Sync a completion produced by the exercise's own flow (code/media/artifact/conversation).
  z.object({ kind: z.literal('external') }),
])

const aiEvaluationSchema = z.object({
  score: z.number().min(0).max(100),
  meets_expectations: z.boolean(),
  feedback: z.string(),
  next_step_hint: z.string(),
})

function monthStartIso(): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ checkpointId: string }> }
) {
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { supabase, user, tenantId } = auth

  const checkpointId = Number.parseInt((await params).checkpointId, 10)
  if (!Number.isInteger(checkpointId) || checkpointId <= 0) {
    return Response.json({ error: 'Invalid checkpoint id' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const body = parsed.data

  const adminClient = createAdminClient()

  // Load checkpoint + linked exercise server-side (config never leaves the server).
  const { data: checkpoint } = await adminClient
    .from('lesson_checkpoints')
    .select(
      'id, tenant_id, lesson_id, exercise_id, placement_type, allow_skip, max_ai_attempts, is_required, is_enabled, exercises(id, title, instructions, description, exercise_type, system_prompt, exercise_config, course_id, tenant_id)'
    )
    .eq('id', checkpointId)
    .single()

  if (!checkpoint || checkpoint.tenant_id !== tenantId || !checkpoint.is_enabled) {
    return Response.json({ error: 'Checkpoint not found' }, { status: 404 })
  }
  const exercise = checkpoint.exercises as unknown as {
    id: number
    title: string
    instructions: string
    description: string | null
    exercise_type: string
    system_prompt: string | null
    exercise_config: Record<string, unknown> | null
    course_id: number
    tenant_id: string
  } | null
  if (!exercise || exercise.tenant_id !== tenantId) {
    return Response.json({ error: 'Checkpoint not found' }, { status: 404 })
  }

  // Active enrollment required — mirrors the RLS insert policy so failures
  // surface as a clear 403 instead of an opaque insert error.
  const { data: enrollment } = await adminClient
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', user.id)
    .eq('course_id', exercise.course_id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!enrollment) {
    return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  const config = exercise.exercise_config ?? {}
  const passingScore =
    typeof config.passing_score === 'number' ? config.passing_score : 70
  const questions = parseCheckpointQuestions(config)
  const exerciseType = exercise.exercise_type

  let evaluatorType: CheckpointEvaluatorType
  let response: Record<string, unknown> = {}
  let evaluation: Record<string, unknown> | null = null
  let score: number | null = null
  let passed: boolean | null = null
  let feedback: string | undefined
  let nextStepHint: string | undefined
  let perQuestion: CheckpointAttemptResult['perQuestion']
  let aiUnavailable = false

  if (body.kind === 'answers') {
    if (
      !(CLOSED_EXERCISE_TYPES as readonly string[]).includes(exerciseType) ||
      !questions
    ) {
      return Response.json(
        { error: 'This checkpoint does not accept answer submissions' },
        { status: 400 }
      )
    }
    const grade = gradeCheckpointQuestions(questions, body.answers)
    evaluatorType = 'deterministic'
    response = { answers: body.answers }
    evaluation = {
      correct_count: grade.correctCount,
      total: grade.total,
      per_question: grade.perQuestion,
    }
    score = grade.score
    passed = grade.score >= passingScore
    perQuestion = grade.perQuestion
  } else if (body.kind === 'text') {
    const textAllowed =
      exerciseType === 'essay' ||
      exerciseType === 'discussion' ||
      ((CLOSED_EXERCISE_TYPES as readonly string[]).includes(exerciseType) &&
        !questions)
    if (!textAllowed) {
      return Response.json(
        { error: 'This checkpoint does not accept text submissions' },
        { status: 400 }
      )
    }
    response = { text: body.text }

    const gate = await checkAiAllowance(adminClient, {
      tenantId,
      userId: user.id,
      checkpointId,
      maxAiAttempts: checkpoint.max_ai_attempts,
    })

    if (!gate.allowed) {
      evaluatorType = 'fallback'
      evaluation = { fallback_reason: gate.reason }
      aiUnavailable = true
    } else {
      try {
        const systemPrompt =
          exercise.system_prompt ??
          (typeof config.system_prompt === 'string' ? config.system_prompt : null)
        const criteria =
          typeof config.evaluation_criteria === 'string'
            ? config.evaluation_criteria
            : ''
        const { object } = await generateObject({
          model: AI_MODELS.grader,
          schema: aiEvaluationSchema,
          system: systemPrompt
            ? `${systemPrompt}\n\nYou are evaluating one short student checkpoint answer. Be fair, concise, and formative.`
            : 'You are an expert educational evaluator. Evaluate the student answer fairly and constructively. Be concise and formative.',
          prompt: `## Exercise: ${exercise.title}\n\n## Instructions given to the student:\n${exercise.instructions}\n${criteria ? `\n## Evaluation criteria:\n${criteria}\n` : ''}\n## Student answer:\n${body.text}\n\nScore 0-100. "feedback" is 2-4 sentences of explanatory feedback; "next_step_hint" is one actionable next step. Respond in the language of the student's answer.`,
          experimental_telemetry: {
            isEnabled: true,
            functionId: 'checkpoint-evaluator',
            metadata: { checkpointId, exerciseId: exercise.id, userId: user.id, tenantId },
          },
        })
        evaluatorType = 'ai'
        score = Math.max(0, Math.min(100, Math.round(object.score)))
        passed = score >= passingScore
        feedback = object.feedback
        nextStepHint = object.next_step_hint
        evaluation = {
          feedback: object.feedback,
          next_step_hint: object.next_step_hint,
          meets_expectations: object.meets_expectations,
        }
      } catch (err) {
        console.error('Checkpoint AI evaluation failed:', err)
        evaluatorType = 'fallback'
        evaluation = { fallback_reason: 'provider_error' }
        aiUnavailable = true
      }
    }
  } else {
    // kind === 'external' — verify the exercise's own flow produced a result.
    if (!(EXTERNAL_EXERCISE_TYPES as readonly string[]).includes(exerciseType)) {
      return Response.json(
        { error: 'This checkpoint does not sync external completions' },
        { status: 400 }
      )
    }
    const [{ data: latestEval }, { data: completion }] = await Promise.all([
      adminClient
        .from('exercise_evaluations')
        .select('id, score, passed, created_at')
        .eq('exercise_id', exercise.id)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      adminClient
        .from('exercise_completions')
        .select('id, score')
        .eq('exercise_id', exercise.id)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle(),
    ])
    if (!latestEval && !completion) {
      return Response.json(
        { error: 'Complete the linked exercise first', notCompleted: true },
        { status: 409 }
      )
    }
    evaluatorType = evaluatorTypeForExternal(exerciseType)
    score = latestEval?.score ?? completion?.score ?? null
    passed = latestEval?.passed ?? (completion ? true : null)
    response = { source: latestEval ? 'exercise_evaluations' : 'exercise_completions' }
    evaluation = {
      synced_evaluation_id: latestEval?.id ?? null,
      synced_completion_id: completion?.id ?? null,
    }
  }

  // Attempt numbering: count + 1, retry once on unique-violation race.
  const { count } = await adminClient
    .from('lesson_checkpoint_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('checkpoint_id', checkpointId)

  const baseRow = {
    tenant_id: tenantId,
    user_id: user.id,
    course_id: exercise.course_id,
    lesson_id: checkpoint.lesson_id,
    checkpoint_id: checkpointId,
    exercise_id: exercise.id,
    placement_source: checkpoint.placement_type,
    response,
    evaluation,
    score,
    passed,
    completed: true,
    evaluator_type: evaluatorType,
  }

  // Insert with the caller's RLS client so DB policies are the last word.
  let attemptNumber = (count ?? 0) + 1
  let { data: attempt, error: insertError } = await supabase
    .from('lesson_checkpoint_attempts')
    .insert({ ...baseRow, attempt_number: attemptNumber })
    .select('id, attempt_number')
    .single()
  if (insertError?.code === '23505') {
    attemptNumber += 1
    ;({ data: attempt, error: insertError } = await supabase
      .from('lesson_checkpoint_attempts')
      .insert({ ...baseRow, attempt_number: attemptNumber })
      .select('id, attempt_number')
      .single())
  }
  if (insertError || !attempt) {
    console.error('Checkpoint attempt insert failed:', insertError)
    return Response.json({ error: 'Failed to record attempt' }, { status: 500 })
  }

  const result: CheckpointAttemptResult = {
    attemptId: attempt.id,
    attemptNumber: attempt.attempt_number,
    evaluatorType,
    completed: true,
    passed,
    score,
    feedback,
    nextStepHint,
    perQuestion,
    aiUnavailable,
    canRetryAi:
      evaluatorType === 'ai' &&
      passed === false &&
      (await checkAiAllowance(adminClient, {
        tenantId,
        userId: user.id,
        checkpointId,
        maxAiAttempts: checkpoint.max_ai_attempts,
      })).allowed,
  }
  return Response.json(result)
}

type AiGate =
  | { allowed: true }
  | {
      allowed: false
      reason:
        | 'plan_excluded'
        | 'checkpoint_attempts_exhausted'
        | 'student_monthly_quota'
        | 'tenant_monthly_quota'
    }

/**
 * Three-level AI allowance: per-checkpoint retries, per-student month, and
 * tenant month (plan allowance is the hard ceiling). Counts come from
 * lesson_checkpoint_attempts itself — no separate accounting table.
 * Check-then-act: a concurrent request can exceed a limit by one; acceptable
 * for formative evaluation quotas.
 */
async function checkAiAllowance(
  adminClient: ReturnType<typeof createAdminClient>,
  args: {
    tenantId: string
    userId: string
    checkpointId: number
    maxAiAttempts: number
  }
): Promise<AiGate> {
  const { data: plan } = await adminClient.rpc('get_plan_features', {
    _tenant_id: args.tenantId,
  })
  const features = (plan?.features ?? {}) as Record<string, unknown>
  const limits = (plan?.limits ?? {}) as Record<string, unknown>
  if (features.ai_grading !== true) return { allowed: false, reason: 'plan_excluded' }

  const tenantMonthly = numberLimit(limits.checkpoint_ai_evals_per_month)
  const studentMonthly = numberLimit(limits.checkpoint_ai_evals_per_student_month)
  if (tenantMonthly === 0 || studentMonthly === 0) {
    return { allowed: false, reason: 'plan_excluded' }
  }

  const since = monthStartIso()
  const [checkpointCount, studentCount, tenantCount] = await Promise.all([
    countAiAttempts(adminClient, {
      user_id: args.userId,
      checkpoint_id: args.checkpointId,
    }),
    studentMonthly === -1
      ? Promise.resolve(0)
      : countAiAttempts(
          adminClient,
          { user_id: args.userId, tenant_id: args.tenantId },
          since
        ),
    tenantMonthly === -1
      ? Promise.resolve(0)
      : countAiAttempts(adminClient, { tenant_id: args.tenantId }, since),
  ])

  if (checkpointCount >= args.maxAiAttempts) {
    return { allowed: false, reason: 'checkpoint_attempts_exhausted' }
  }
  if (studentMonthly !== -1 && studentCount >= studentMonthly) {
    return { allowed: false, reason: 'student_monthly_quota' }
  }
  if (tenantMonthly !== -1 && tenantCount >= tenantMonthly) {
    return { allowed: false, reason: 'tenant_monthly_quota' }
  }
  return { allowed: true }
}

function numberLimit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function countAiAttempts(
  adminClient: ReturnType<typeof createAdminClient>,
  filters: Record<string, string | number>,
  createdAfter?: string
): Promise<number> {
  let query = adminClient
    .from('lesson_checkpoint_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('evaluator_type', 'ai')
  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value)
  }
  if (createdAfter) query = query.gte('created_at', createdAfter)
  const { count } = await query
  return count ?? 0
}
