import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { hasCourseAccess } from '@/lib/services/course-access'
import { recordExerciseCompletion } from '@/lib/exercises/record-completion'
import { AiProviderError, classifyProviderError, handleAiError, isAiError } from '@/lib/ai/errors'
import { withTenantAi } from '@/lib/ai/with-tenant-ai'
import { runSpeechPipeline, SpeechAudioError } from '@/lib/speech/pipeline'
import { parseSpeechRubricConfig } from '@/lib/speech/learner-rubric'
import { getPipeline } from '@/lib/speech/registry'
import type { ExerciseContext } from '@/lib/speech/types'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'

export const maxDuration = 120

/** Leaves ~20s of `maxDuration` to reset the row and answer. */
const PIPELINE_BUDGET_MS = 100_000

const STORAGE_BUCKET = 'exercise-media'

/** The `exercises(...)` join on the submission row. */
type JoinedExercise = {
  id: number
  title: string | null
  instructions: string | null
  course_id: number
  tenant_id: string
  exercise_config: {
    passing_score?: number
    topic_prompt?: string
    rubric?: ExerciseContext['rubric']
  } | null
  exercise_grading_secrets?: unknown
}

export async function POST(req: Request) {
  // 1. Auth — cookie session (web) or Bearer token (mobile), server-verified
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

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
    .select(`*, exercises(id, title, instructions, exercise_config, course_id, tenant_id, ${GRADING_SECRETS_EMBED})`)
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

  // The rubric lives outside the student-readable row (#833).
  const joined = submission.exercises as unknown as JoinedExercise | null
  const exercise = joined ? withGradingSecrets(joined) : null

  // 5. Status guard — only pending submissions can be analyzed (prevents re-triggering)
  const passingScore = exercise?.exercise_config?.passing_score ?? 70
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
  if (!exercise || exercise.tenant_id !== tenantId) {
    return new Response('Exercise not found', { status: 404 })
  }

  // 6b. Course access (issue #532). Ownership of the submission is not access:
  // this route runs on the admin client and spends AI credits, and an
  // entitlement can be revoked — or the tenant's access cutoff can pass —
  // between the gated upload and this call.
  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return new Response('You do not have access to this course', { status: 403 })
  }

  // 6c. Role: only decides the error copy (admins get the settings link).
  // tenant_users is authoritative; x-user-id does not reach route handlers.
  const { data: membership } = await adminClient
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const canConfigure = membership?.role === 'admin'

  return withTenantAi({ tenantId, feature: 'speech_stt', canConfigure, actorId: user.id }, async (ai) => {
    // 7. Resolve the school's STT + coach BEFORE claiming the submission: no
    // key (or an unsupported model) is a typed 402/424/422 and the row stays
    // `pending`, so the student can retry once the admin fixes it.
    // The error names whichever of speech_stt / speech_coach was the problem.
    let providers: Awaited<ReturnType<typeof getPipeline>>
    try {
      providers = await getPipeline(ai)
    } catch (err) {
      return await handleAiError(err, {
        feature: isAiError(err) && err.feature ? err.feature : 'speech_stt',
        canConfigure,
        tenantId,
        providerId: ai.lastProviderId(),
        actorId: user.id,
      })
    }

    // 8. Atomically set processing (prevents concurrent analysis of same submission)
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
      // 9. Get signed URL for the stored audio
      const { data: urlData } = await adminClient
        .storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(submission.media_url, 3600)

      if (!urlData?.signedUrl) throw new SpeechAudioError('unavailable')

      const config = exercise.exercise_config ?? {}

      const exerciseContext: ExerciseContext = {
        title: exercise.title ?? 'Exercise',
        instructions: exercise.instructions ?? '',
        topic_prompt: config.topic_prompt,
        rubric: config.rubric,
        speechRubric: parseSpeechRubricConfig(config),
        exerciseId: submission.exercise_id,
        userId: user.id,
        passingScore,
      }

      // 10. Run the speech pipeline (transcribe, then grade)
      // Bounded below `maxDuration`: if the platform killed the request mid-poll the row would stay
      // `processing` for good (retries 409). A timeout here lands in the catch, which resets it.
      // The deadline also aborts the provider calls, so a retry cannot overlap a still-running paid run.
      const controller = new AbortController()
      let deadline: ReturnType<typeof setTimeout> | undefined
      const evaluation = await Promise.race([
        runSpeechPipeline(urlData.signedUrl, exerciseContext, providers, {
          supabase: adminClient,
          abortSignal: controller.signal,
        }),
        new Promise<never>((_, reject) => {
          deadline = setTimeout(() => {
            controller.abort()
            reject(new AiProviderError({ upstreamStatus: 408 }))
          }, PIPELINE_BUDGET_MS)
        }),
      ]).finally(() => clearTimeout(deadline))

      // 11. Save results
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

      // 12. Insert unified evaluation record
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

      // 13. Record exercise completion only if score meets passing threshold
      if (passed) {
        const completion = await recordExerciseCompletion(adminClient, {
          exerciseId: submission.exercise_id,
          userId: user.id,
          score: evaluation.score,
        })
        if (completion.error) console.error('Failed to record exercise completion:', completion.error)
      }

      return Response.json({ evaluation, passed, passingScore })
    } catch (err) {
      // Name only: provider and DB messages can carry request context.
      console.error('Speech pipeline error:', err instanceof Error ? err.name : typeof err)

      // Never echo err.message: the client gets a code. A school-side AI failure
      // (key rejected, quota, provider down) puts the row back to `pending` so
      // the same recording can be re-analyzed once it is fixed; anything else
      // is terminal for this recording.
      let response: Response
      let retryable = false
      if (err instanceof SpeechAudioError) {
        response = Response.json(
          { error: { code: 'audio_unavailable' } },
          { status: err.reason === 'unavailable' ? 500 : 422 },
        )
      } else {
        try {
          response = await handleAiError(err, {
            feature: isAiError(err) && err.feature ? err.feature : 'speech_coach',
            canConfigure,
            tenantId,
            providerId: ai.lastProviderId(),
            actorId: user.id,
          })
          // Retry only what the school can fix or a blip (key, quota, model, timeout/5xx). A deterministic
          // provider rejection (unsupported codec, 400/422) would loop forever against the school's paid key.
          const classified = classifyProviderError(err)
          retryable = !(classified instanceof AiProviderError) || classified.transient
        } catch {
          response = Response.json({ error: { code: 'analysis_failed' } }, { status: 500 })
        }
      }

      await adminClient
        .from('exercise_media_submissions')
        .update({ status: retryable ? 'pending' : 'failed' })
        .eq('id', submissionId)

      return response
    }
  })
}
