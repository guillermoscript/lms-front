import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { runSpeechPipeline } from '@/lib/speech/pipeline'
import { getPipeline } from '@/lib/speech/registry'
import type { ExerciseContext } from '@/lib/speech/types'

export const maxDuration = 120

const STORAGE_BUCKET = 'exercise-media'

export async function POST(req: Request) {
  const supabase = await createClient()
  const adminClient = createAdminClient()
  const tenantId = await getCurrentTenantId()

  // 1. Auth — server-verified
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Parse & validate input
  let submissionId: number
  try {
    const body = await req.json()
    submissionId = parseInt(body.submissionId)
    if (isNaN(submissionId) || submissionId <= 0) throw new Error('invalid')
  } catch {
    return new Response('submissionId is required', { status: 400 })
  }

  // 3. Fetch submission via admin client + manual ownership checks
  const { data: submission, error: fetchError } = await adminClient
    .from('exercise_media_submissions')
    .select('*, exercises(id, title, instructions, exercise_config, course_id, tenant_id)')
    .eq('id', submissionId)
    .single()

  if (fetchError || !submission) {
    return new Response('Submission not found', { status: 404 })
  }

  // 4. Ownership checks — user must own the submission AND it must be in their tenant
  if (submission.user_id !== user.id) {
    return new Response('Submission not found', { status: 404 })
  }
  if (submission.tenant_id !== tenantId) {
    return new Response('Submission not found', { status: 404 })
  }

  // 5. Status guard — only pending submissions can be analyzed (prevents re-triggering)
  const passingScore = ((submission.exercises as any)?.exercise_config as any)?.passing_score ?? 70
  if (submission.status === 'completed') {
    return Response.json({ already_completed: true, evaluation: submission.ai_evaluation, passed: true, passingScore })
  }
  if (submission.status === 'processing') {
    return new Response('This submission is already being analyzed', { status: 409 })
  }
  if (submission.status !== 'pending') {
    return new Response('This submission cannot be analyzed', { status: 400 })
  }

  // 6. Verify exercise tenant matches (defense in depth)
  const exercise = submission.exercises as any
  if (!exercise || exercise.tenant_id !== tenantId) {
    return new Response('Exercise not found', { status: 404 })
  }

  // 7. Atomically set processing (prevents concurrent analysis of same submission)
  const { data: updated, error: updateError } = await adminClient
    .from('exercise_media_submissions')
    .update({ status: 'processing' })
    .eq('id', submissionId)
    .eq('status', 'pending') // only transition from pending → processing
    .select('id')
    .single()

  if (updateError || !updated) {
    return new Response('Submission is already being processed', { status: 409 })
  }

  try {
    // 8. Get signed URL for the stored audio
    const { data: urlData } = await adminClient
      .storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(submission.media_url, 3600)

    if (!urlData?.signedUrl) throw new Error('Could not get signed URL for media file')

    const config = exercise.exercise_config ?? {}

    const exerciseContext: ExerciseContext = {
      title: exercise.title ?? 'Exercise',
      instructions: exercise.instructions ?? '',
      topic_prompt: config.topic_prompt,
      rubric: config.rubric,
      exerciseId: submission.exercise_id,
      userId: user.id,
      passingScore,
    }

    const { stt, coach } = getPipeline(
      config.stt_provider ?? 'assemblyai',
      config.ai_coach ?? 'openai'
    )

    // 9. Run the speech pipeline (AI evaluates + calls markExerciseCompleted if score passes)
    const evaluation = await runSpeechPipeline(urlData.signedUrl, exerciseContext, { stt, coach }, { supabase: adminClient })

    // 10. Save results
    const passed = evaluation.score >= passingScore
    await adminClient
      .from('exercise_media_submissions')
      .update({
        status: passed ? 'completed' : 'failed',
        ai_evaluation: evaluation as unknown as Record<string, unknown>,
        score: evaluation.score,
        duration_seconds: evaluation.metrics.duration_seconds,
      })
      .eq('id', submissionId)

    // 11. Insert unified evaluation record
    const mediaType = submission.media_type === 'video' ? 'video' : 'audio'
    await adminClient.from('exercise_evaluations').insert({
      exercise_id: submission.exercise_id,
      user_id: user.id,
      tenant_id: tenantId,
      engine_type: mediaType as 'audio' | 'video',
      submission_id: submissionId,
      submission_source: 'exercise_media_submissions',
      score: evaluation.score,
      passed,
      ai_result: {
        strengths: evaluation.strengths,
        improvements: evaluation.improvements,
        focus_next: evaluation.focus_next,
        annotated_transcript: evaluation.annotated_transcript,
      },
      ai_metrics: evaluation.metrics as unknown as Record<string, unknown>,
    })

    // 12. Record exercise completion only if score meets passing threshold
    if (passed) {
      await adminClient.from('exercise_completions').insert({
        exercise_id: submission.exercise_id,
        user_id: user.id,
        completed_by: user.id,
        score: evaluation.score,
        tenant_id: tenantId,
      }).select('id').single()
      // unique index (exercise_id, user_id) prevents duplicates
    }

    return Response.json({ evaluation, passed, passingScore })
  } catch (err: any) {
    console.error('Speech pipeline error:', err)

    await adminClient
      .from('exercise_media_submissions')
      .update({ status: 'failed' })
      .eq('id', submissionId)

    return new Response(err.message ?? 'Analysis failed', { status: 500 })
  }
}
