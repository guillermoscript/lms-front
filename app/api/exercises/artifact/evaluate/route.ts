import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { createTenantAi, type ResolvedFeatureModel } from '@/lib/ai/tenant-ai'
import { aiFailureResponse, canConfigureAi } from '@/lib/exercises/ai-failure'
import { gradeWrittenSubmission } from '@/lib/exercises/grade-written-submission'
import { hasCourseAccess } from '@/lib/services/course-access'
import { recordExerciseCompletion } from '@/lib/exercises/record-completion'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

export const maxDuration = 120

export async function POST(req: Request) {
  // 1. Auth — session cookie (web) or Bearer token (native app, #839)
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { supabase, user, tenantId } = auth
  const adminClient = createAdminClient()

  // 2. Parse input
  let exerciseId: number
  let content: string
  let metadata: Record<string, unknown> = {}
  try {
    const body = await req.json()
    exerciseId = parseInt(body.exerciseId)
    content = body.content
    metadata = body.metadata ?? {}
    if (isNaN(exerciseId) || exerciseId <= 0) throw new Error('invalid')
    if (!content || typeof content !== 'string') throw new Error('content required')
  } catch {
    return Response.json({ error: 'exerciseId and content are required' }, { status: 400 })
  }

  // 3. Fetch exercise via admin client
  const { data: storedExercise, error: fetchError } = await adminClient
    .from('exercises')
    .select(`id, title, instructions, exercise_type, exercise_config, course_id, tenant_id, courses(tenant_id), ${GRADING_SECRETS_EMBED}`)
    .eq('id', exerciseId)
    .single()
  // Criteria and grader prompt live outside the student-readable row (#833).
  const exercise = storedExercise ? withGradingSecrets(storedExercise) : null

  if (fetchError || !exercise) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // 4. Validate exercise type and tenant
  if (exercise.exercise_type !== 'artifact') {
    return Response.json({ error: 'Not an artifact exercise' }, { status: 400 })
  }
  const courseTenantId = (exercise.courses as { tenant_id?: string } | null)?.tenant_id
  // BOTH the exercise row and its course must belong to the caller's tenant.
  if (exercise.tenant_id !== tenantId || courseTenantId !== tenantId) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // 5. Verify access (entitlements model)
  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  // Resolve the school's grader BEFORE the attempt budget: a school without a
  // usable key gets the typed AI error and the attempt is never counted.
  const ai = createTenantAi(tenantId, { actorId: user.id })
  const aiFailure = async (err: unknown) =>
    aiFailureResponse(
      err,
      {
        feature: 'exercise_grader',
        canConfigure: await canConfigureAi(supabase, user.id, tenantId),
        tenantId,
        providerId: ai.lastProviderId(),
        actorId: user.id,
      },
      () => Response.json({ error: 'Evaluation failed' }, { status: 500 })
    )
  let grader: ResolvedFeatureModel
  try {
    grader = await ai.getModelForFeature('exercise_grader')
  } catch (err) {
    return aiFailure(err)
  }

  // 6. Rate limit — max 10 evaluations/hour per exercise+user
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await adminClient
    .from('exercise_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', exerciseId)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .gte('created_at', oneHourAgo)

  if ((recentCount ?? 0) >= 10) {
    return Response.json({
      error: 'Rate limit exceeded. Maximum 10 evaluations per hour.',
      rateLimited: true,
    }, { status: 429 })
  }

  // 7-8. AI evaluation through the shared grader (rounds/clamps the score,
  // resolves the passing score from exercise_config).
  try {
    const { evaluation, score, passed, passingScore } = await gradeWrittenSubmission(
      exercise,
      content,
      grader.model,
      metadata
    )

    // 10. Insert evaluation record
    const { error: evaluationError } = await adminClient.from('exercise_evaluations').insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: 'simulation',
      score,
      passed,
      ai_result: {
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
      },
    })

    if (evaluationError) {
      console.error('Failed to record exercise evaluation:', evaluationError)
      return Response.json({ error: 'Could not record the result' }, { status: 500 })
    }

    // 11. Record completion if passed
    if (passed) {
      const completion = await recordExerciseCompletion(adminClient, { exerciseId, userId: user.id, score })
      if (completion.error) {
        console.error('Failed to record exercise completion:', completion.error)
        return Response.json({ error: 'Could not record the result' }, { status: 500 })
      }
    }

    // 12. Track the submission. No `attempt_number`: the only count this route
    // has is the 1-hour rate-limit window, and passing that off as an absolute
    // attempt ordinal would quietly reset every hour. Ordinality is recoverable
    // in OpenPanel by counting this event per user+exercise.
    await track(
      ANALYTICS_EVENTS.EXERCISE_SUBMITTED,
      {
        exercise_id: exerciseId,
        course_id: exercise.course_id,
        exercise_type: exercise.exercise_type,
        score,
        passed,
        passing_score: passingScore,
        attempts_last_hour: (recentCount ?? 0) + 1,
      },
      { userId: user.id, tenantId, role: 'student' }
    )

    // 13. Return result (never include evaluation_criteria or system_prompt)
    return Response.json({
      score,
      feedback: evaluation.feedback,
      passed,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      passingScore,
    })
  } catch (err) {
    return aiFailure(err)
  }
}
