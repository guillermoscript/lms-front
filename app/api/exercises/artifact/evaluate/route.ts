import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { evaluateArtifactExercise } from '@/lib/exercises/evaluate-artifact'
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
  const { user, tenantId } = auth
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
  if (exercise.tenant_id !== tenantId && courseTenantId !== tenantId) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  // 5. Verify access (entitlements model)
  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
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

  // 7. Extract server-side config
  const config = (exercise.exercise_config ?? {}) as {
    evaluation_criteria?: string
    system_prompt?: string | null
    passing_score?: number
  }
  const passingScore = config.passing_score ?? 70

  // 8. AI evaluation
  try {
    const evaluation = await evaluateArtifactExercise(exercise, content, metadata)

    const passed = evaluation.score >= passingScore

    // 10. Insert evaluation record
    await adminClient.from('exercise_evaluations').insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: 'simulation',
      score: evaluation.score,
      passed,
      ai_result: {
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
      },
    })

    // 11. Record completion if passed
    if (passed) {
      const completion = await recordExerciseCompletion(adminClient, { exerciseId, userId: user.id, score: evaluation.score })
      if (completion.error) console.error('Failed to record exercise completion:', completion.error)
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
        score: evaluation.score,
        passed,
        passing_score: passingScore,
        attempts_last_hour: (recentCount ?? 0) + 1,
      },
      { userId: user.id, tenantId, role: 'student' }
    )

    // 13. Return result (never include evaluation_criteria or system_prompt)
    return Response.json({
      score: evaluation.score,
      feedback: evaluation.feedback,
      passed,
      strengths: evaluation.strengths,
      improvements: evaluation.improvements,
      passingScore,
    })
  } catch (err) {
    console.error('Artifact evaluation error:', err)
    return Response.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
