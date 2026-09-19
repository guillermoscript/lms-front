import { generateText, Output } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { hasCourseAccess } from '@/lib/services/course-access'
import { AI_MODELS } from '@/lib/ai/config'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import {
  ConversationEvaluationSchema,
  ConversationTranscriptSchema,
  buildConversationGraderPrompt,
  parseConversationConfig,
} from '@/lib/speech/conversation'

export const maxDuration = 120

/**
 * Grades a finished live conversation.
 *
 * The transcript comes from the browser (the realtime socket is
 * browser ↔ provider, the server never sees it), so it is only accepted
 * against a session this user opened through the token route, and only once.
 */
export async function POST(req: Request) {
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

  let exerciseId: number
  let transcript
  try {
    const body = await req.json()
    exerciseId = parseInt(body.exerciseId)
    if (isNaN(exerciseId) || exerciseId <= 0) throw new Error('invalid')
    transcript = ConversationTranscriptSchema.parse(body.transcript)
  } catch {
    return Response.json({ error: 'exerciseId and a non-empty transcript are required' }, { status: 400 })
  }

  const { data: exercise, error } = await adminClient
    .from('exercises')
    .select('id, title, instructions, exercise_type, exercise_config, course_id, tenant_id')
    .eq('id', exerciseId)
    .single()

  if (error || !exercise || exercise.tenant_id !== tenantId) {
    return Response.json({ error: 'Exercise not found' }, { status: 404 })
  }
  if (exercise.exercise_type !== 'real_time_conversation') {
    return Response.json({ error: 'Not a conversation exercise' }, { status: 400 })
  }
  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return Response.json({ error: 'You do not have access to this course' }, { status: 403 })
  }

  // Claim the open session atomically: pending → processing. No open session
  // means the transcript did not come from a conversation we started.
  const { data: session } = await adminClient
    .from('exercise_media_submissions')
    .select('id, created_at')
    .eq('exercise_id', exerciseId)
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('media_type', 'conversation')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) {
    return Response.json({ error: 'No open conversation to grade' }, { status: 409 })
  }

  const { data: claimed } = await adminClient
    .from('exercise_media_submissions')
    .update({ status: 'processing' })
    .eq('id', session.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()

  if (!claimed) {
    return Response.json({ error: 'This conversation is already being graded' }, { status: 409 })
  }

  const config = parseConversationConfig(exercise.exercise_config)
  const durationSeconds = session.created_at
    ? Math.max(0, Math.round((Date.now() - new Date(session.created_at).getTime()) / 1000))
    : null
  const studentTurns = transcript.filter((t) => t.role === 'user')
  const studentWords = studentTurns.reduce((n, t) => n + t.text.split(/\s+/).length, 0)

  // The transcript is the browser's word. It can't be proven, but it can be
  // impossible: nobody speaks faster than ~4 words a second, so a long
  // "conversation" posted seconds after the session opened was not spoken.
  if (durationSeconds != null && studentWords > 20 && studentWords > durationSeconds * 4) {
    await adminClient.from('exercise_media_submissions').update({ status: 'failed' }).eq('id', session.id)
    return Response.json({ error: 'Transcript does not match the conversation' }, { status: 422 })
  }

  try {
    const { output } = await generateText({
      model: AI_MODELS.grader,
      output: Output.object({ schema: ConversationEvaluationSchema }),
      system: buildConversationGraderPrompt(exercise, config),
      prompt: transcript.map((t) => `${t.role === 'user' ? 'STUDENT' : 'PARTNER'}: ${t.text}`).join('\n'),
    })
    if (!output) throw new Error('Grader returned no output')

    const score = Math.max(0, Math.min(100, Math.round(output.score)))
    const passed = score >= config.passing_score

    await adminClient
      .from('exercise_media_submissions')
      .update({
        status: passed ? 'completed' : 'failed',
        stt_result: { transcript },
        ai_evaluation: output,
        score,
        duration_seconds: durationSeconds,
      })
      .eq('id', session.id)

    await adminClient.from('exercise_evaluations').insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: 'simulation',
      submission_id: session.id,
      submission_source: 'exercise_media_submissions',
      score,
      passed,
      ai_result: {
        feedback: output.feedback,
        strengths: output.strengths,
        improvements: output.improvements,
        corrections: output.corrections,
        transcript,
      },
      ai_metrics: {
        duration_seconds: durationSeconds,
        turns_count: transcript.length,
        student_turns: studentTurns.length,
        student_words: studentWords,
      },
    })

    if (passed) {
      // exercise_completions has NO tenant_id column — sending it 400s the insert.
      await adminClient
        .from('exercise_completions')
        .insert({ exercise_id: exerciseId, user_id: user.id, completed_by: user.id, score })
        .select('id')
        .single()
      // unique index (exercise_id, user_id) — an error on re-pass is expected
    }

    await track(
      ANALYTICS_EVENTS.EXERCISE_SUBMITTED,
      {
        exercise_id: exerciseId,
        course_id: exercise.course_id,
        exercise_type: exercise.exercise_type,
        score,
        passed,
        passing_score: config.passing_score,
      },
      { userId: user.id, tenantId, role: 'student' }
    )

    return Response.json({ ...output, score, passed, passingScore: config.passing_score })
  } catch (err) {
    console.error('Conversation evaluation error:', err)
    // Back to pending, not failed: the conversation happened and the student
    // should be able to get it graded on a retry.
    await adminClient.from('exercise_media_submissions').update({ status: 'pending' }).eq('id', session.id)
    return Response.json({ error: 'Evaluation failed' }, { status: 500 })
  }
}
