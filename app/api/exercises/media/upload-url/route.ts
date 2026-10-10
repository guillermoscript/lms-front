import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { hasCourseAccess } from '@/lib/services/course-access'
import { createTenantAi } from '@/lib/ai/tenant-ai'
import { isAiError } from '@/lib/ai/errors'
import { aiFailureResponse, canConfigureAi } from '@/lib/exercises/ai-failure'
import { getPipeline } from '@/lib/speech/registry'

const MEDIA_EXERCISE_TYPES = ['audio_evaluation', 'video_evaluation']
const STORAGE_BUCKET = 'exercise-media'
// mov/3gp: native mobile camera output (iOS records .mov, some Androids .3gp)
const ALLOWED_EXTENSIONS = new Set(['webm', 'ogg', 'mp3', 'mp4', 'm4a', 'wav', 'aac', 'mov', '3gp'])
const MAX_PENDING_SUBMISSIONS = 5 // per user per exercise
// A row still pending/processing after this long is not in flight: analyze is
// capped at 120s and the upload before it takes minutes at most. Nothing sweeps
// such a row (an abandoned upload, an analyze reset to pending on a provider
// failure) and only the web client's in-page retry re-analyzes one, so counting
// them without a bound locked the student out of the exercise for good after
// five.
const PENDING_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: Request) {
  // 1. Auth — cookie session (web) or Bearer token (mobile), server-verified
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

  // 2. Parse & validate input
  let exerciseId: string, mediaType: string, filename: string
  try {
    const body = await req.json()
    exerciseId = body.exerciseId
    mediaType = body.mediaType
    filename = body.filename
  } catch {
    return new Response('Invalid request body', { status: 400 })
  }

  if (!exerciseId || !mediaType || !filename) {
    return new Response('Missing required fields: exerciseId, mediaType, filename', { status: 400 })
  }

  if (!['audio', 'video'].includes(mediaType)) {
    return new Response('mediaType must be "audio" or "video"', { status: 400 })
  }

  // Sanitize exerciseId — must be a positive integer
  const exerciseIdInt = parseInt(exerciseId)
  if (isNaN(exerciseIdInt) || exerciseIdInt <= 0) {
    return new Response('Invalid exerciseId', { status: 400 })
  }

  // Sanitize extension — whitelist only, prevents path traversal via crafted filenames
  const rawExt = (filename.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const ext = ALLOWED_EXTENSIONS.has(rawExt) ? rawExt : 'webm'

  // 3. Validate exercise exists, belongs to this tenant, and is the right type
  const { data: exercise, error: exerciseError } = await adminClient
    .from('exercises')
    .select('id, exercise_type, course_id, tenant_id, exercise_config')
    .eq('id', exerciseIdInt)
    .single()

  if (exerciseError || !exercise) {
    return new Response('Exercise not found', { status: 404 })
  }

  // Explicit tenant ownership check
  if (exercise.tenant_id !== tenantId) {
    return new Response('Exercise not found', { status: 404 })
  }

  if (!MEDIA_EXERCISE_TYPES.includes(exercise.exercise_type)) {
    return new Response('Exercise does not support media submissions', { status: 400 })
  }

  // 4. Verify access (entitlements model)
  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return new Response('You are not enrolled in this course', { status: 403 })
  }

  // 4b. Resolve the school's STT + coach, the exact pair /media/analyze runs,
  // BEFORE the caps and before any row (#958). The row opened below is what the
  // daily cap counts, so a school with no usable key used to cost the student
  // an attempt per try and only said so at analyze. Now it is the typed
  // 402/424/422 here, with nothing written. The role lookup (settings link for
  // admins) only runs on this error path.
  const ai = createTenantAi(tenantId, { actorId: user.id })
  try {
    await getPipeline(ai)
  } catch (err) {
    return aiFailureResponse(
      err,
      {
        // The error names whichever of speech_stt / speech_coach was the problem.
        feature: isAiError(err) && err.feature ? err.feature : 'speech_stt',
        canConfigure: await canConfigureAi(auth.supabase, user.id, tenantId),
        tenantId,
        providerId: ai.lastProviderId(),
        actorId: user.id,
      },
      () => new Response('Failed to create upload URL', { status: 500 })
    )
  }

  // 5. Rate limit — prevent flooding with pending/processing submissions
  const { count: pendingCount } = await adminClient
    .from('exercise_media_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('exercise_id', exerciseIdInt)
    .eq('user_id', user.id)
    .in('status', ['pending', 'processing'])
    .gte('created_at', new Date(Date.now() - PENDING_WINDOW_MS).toISOString())

  if ((pendingCount ?? 0) >= MAX_PENDING_SUBMISSIONS) {
    return new Response('Too many pending submissions. Please wait for current ones to complete.', { status: 429 })
  }

  // 5b. Daily attempt limit (0 = unlimited)
  const config = (exercise.exercise_config ?? {}) as { max_daily_attempts?: number }
  const maxDailyAttempts = config.max_daily_attempts ?? 5

  let dailyAttemptsUsed = 0
  if (maxDailyAttempts > 0) {
    const todayMidnight = new Date()
    todayMidnight.setUTCHours(0, 0, 0, 0)

    const { count: dailyCount } = await adminClient
      .from('exercise_media_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', exerciseIdInt)
      .eq('user_id', user.id)
      .gte('created_at', todayMidnight.toISOString())

    dailyAttemptsUsed = dailyCount ?? 0
    if (dailyAttemptsUsed >= maxDailyAttempts) {
      return Response.json(
        { error: 'daily_limit_reached', limit: maxDailyAttempts, message: 'Daily attempt limit reached' },
        { status: 429 }
      )
    }
  }

  // 6. Build a safe storage path (no user-controlled segments except sanitized ext)
  const storagePath = `${tenantId}/${exerciseIdInt}/${user.id}/${Date.now()}.${ext}`

  // 7. Create signed upload URL
  const { data: uploadData, error: uploadError } = await adminClient
    .storage
    .from(STORAGE_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (uploadError || !uploadData) {
    console.error('Storage signed URL error:', uploadError)
    return new Response('Failed to create upload URL', { status: 500 })
  }

  // 8. Create pending submission record
  const { data: submission, error: submissionError } = await adminClient
    .from('exercise_media_submissions')
    .insert({
      exercise_id: exerciseIdInt,
      user_id: user.id,
      tenant_id: tenantId,
      media_url: storagePath,
      media_type: mediaType,
      status: 'pending',
    })
    .select('id')
    .single()

  if (submissionError || !submission) {
    console.error('Submission insert error:', submissionError)
    return new Response('Failed to create submission record', { status: 500 })
  }

  return Response.json({
    submissionId: submission.id,
    uploadUrl: uploadData.signedUrl,
    storagePath,
    dailyAttemptsUsed: dailyAttemptsUsed + 1,
    maxDailyAttempts,
  })
}
