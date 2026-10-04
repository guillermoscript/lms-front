import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { evaluateWrittenExercise, type WrittenEvaluation } from '@/lib/exercises/evaluate-written'
import { hasCourseAccess } from '@/lib/services/course-access'
import { getEngineType } from '@/lib/exercises/engine'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { recordExerciseCompletion } from '@/lib/exercises/record-completion'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

export const maxDuration = 120

/** Longest submission the grader reads. A whole Sandpack project fits comfortably. */
const MAX_CONTENT_CHARS = 60_000

/**
 * Grade a text or code exercise and record the result (#843).
 *
 * `exercise_completions` and `exercise_evaluations` are server-write-only, so
 * this is how a coding challenge (web + native) and the MCP tutor get credit:
 * the client sends the student's answer, the platform grader scores it, and
 * both rows are written with the admin client. The score is never taken from
 * the request.
 *
 * Auth: session cookie (web) or `Authorization: Bearer` (native app, MCP).
 */
export async function POST(req: Request) {
  const auth = await getApiAuthContext(req)
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

  let exerciseId: number
  let content: string
  try {
    const body = await req.json()
    exerciseId = Number(body.exerciseId)
    content = body.content
    if (!Number.isInteger(exerciseId) || exerciseId <= 0) throw new Error('invalid')
    if (typeof content !== 'string' || !content.trim()) throw new Error('content required')
  } catch {
    return Response.json({ error: 'exerciseId and content are required' }, { status: 400 })
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return Response.json({ error: 'Submission is too long' }, { status: 413 })
  }

  const { data: stored } = await adminClient
    .from('exercises')
    .select(`id, title, instructions, exercise_type, exercise_config, course_id, tenant_id, status, system_prompt, ${GRADING_SECRETS_EMBED}`)
    .eq('id', exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  // Criteria, answer keys and the grader prompt live outside the student-readable row (#833).
  const exercise = stored ? withGradingSecrets(stored) : null
  if (!exercise || exercise.status !== 'published') {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }

  const exerciseType = exercise.exercise_type as string
  const engineType = getEngineType(exerciseType)
  if (engineType !== 'text' && engineType !== 'code') {
    return Response.json({ error: 'This exercise is graded in its own flow' }, { status: 400 })
  }

  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return Response.json({ error: 'Not enrolled in this course' }, { status: 403 })
  }

  // A text exercise embedded as a lesson checkpoint must be answered inside the
  // lesson so the attempt counts toward the checkpoint (#392). Code challenges
  // are the checkpoint's own external flow, so they stay allowed.
  if (engineType === 'text') {
    const { data: checkpoint } = await adminClient
      .from('lesson_checkpoints')
      .select('lesson_id')
      .eq('exercise_id', exerciseId)
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle()
    if (checkpoint) {
      return Response.json(
        { error: 'Answer this exercise inside its lesson', checkpointLessonId: checkpoint.lesson_id },
        { status: 409 }
      )
    }
  }

  // Same budget as the artifact grader: 10 graded attempts per hour per exercise.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await adminClient
    .from('exercise_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', exerciseId)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .gte('created_at', oneHourAgo)
  if ((recentCount ?? 0) >= 10) {
    return Response.json(
      { error: 'Rate limit exceeded. Maximum 10 evaluations per hour.', rateLimited: true },
      { status: 429 }
    )
  }

  let evaluation: WrittenEvaluation
  let passingScore: number
  try {
    const result = await evaluateWrittenExercise(exercise, content)
    evaluation = result.evaluation
    passingScore = result.passingScore
  } catch (err) {
    console.error('Exercise evaluation error:', err)
    return Response.json({ error: 'Evaluation failed' }, { status: 500 })
  }

  const score = Math.max(0, Math.min(100, Math.round(evaluation.score)))
  const passed = score >= passingScore

  const { data: evaluationRow, error: evaluationError } = await adminClient
    .from('exercise_evaluations')
    .insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: engineType,
      score,
      passed,
      ai_result: {
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
      },
    })
    .select('attempt_number')
    .single()
  if (evaluationError) console.error('Failed to record exercise evaluation:', evaluationError)

  let completed = false
  let alreadyCompleted = false
  if (passed) {
    const completion = await recordExerciseCompletion(adminClient, { exerciseId, userId: user.id, score })
    if (completion.error) {
      console.error('Failed to record exercise completion:', completion.error)
      return Response.json({ error: 'Could not record the result' }, { status: 500 })
    }
    completed = true
    alreadyCompleted = !completion.created
  }

  await track(
    ANALYTICS_EVENTS.EXERCISE_SUBMITTED,
    {
      exercise_id: exerciseId,
      course_id: exercise.course_id,
      exercise_type: exerciseType,
      score,
      passed,
      passing_score: passingScore,
      attempts_last_hour: (recentCount ?? 0) + 1,
    },
    { userId: user.id, tenantId, role: 'student' }
  )

  // Never echo criteria, answer keys or the grader prompt.
  return Response.json({
    score,
    passed,
    feedback: evaluation.feedback,
    strengths: evaluation.strengths,
    improvements: evaluation.improvements,
    passingScore,
    attemptNumber: evaluationRow?.attempt_number ?? null,
    completed,
    alreadyCompleted,
  })
}
