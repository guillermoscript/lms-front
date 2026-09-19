import { openai } from '@ai-sdk/openai'
import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { hasCourseAccess } from '@/lib/services/course-access'
import { hasPlanFeature } from '@/lib/plans/server'
import {
  CONVERSATION_TOOLS,
  REALTIME_MODEL,
  buildConversationInstructions,
  parseConversationConfig,
} from '@/lib/speech/conversation'

/**
 * Setup endpoint for `experimental_useRealtime` (the hook POSTs here on
 * `connect()` and expects `{ token, url, tools }`).
 *
 * The tutor's instructions, voice and turn detection are embedded in the
 * ephemeral token from `exercise_config` — the `sessionConfig` the browser
 * sends in the body is deliberately ignored. Each mint opens a
 * `exercise_media_submissions` row (`media_type = 'conversation'`), which is
 * what the daily cap counts and what the evaluate route later closes.
 */
export async function POST(req: Request) {
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

  const exerciseId = parseInt(new URL(req.url).searchParams.get('exerciseId') ?? '')
  if (isNaN(exerciseId) || exerciseId <= 0) {
    return new Response('exerciseId is required', { status: 400 })
  }

  const { data: exercise, error } = await adminClient
    .from('exercises')
    .select('id, title, instructions, system_prompt, exercise_type, exercise_config, course_id, tenant_id')
    .eq('id', exerciseId)
    .single()

  if (error || !exercise || exercise.tenant_id !== tenantId) {
    return new Response('Exercise not found', { status: 404 })
  }
  if (exercise.exercise_type !== 'real_time_conversation') {
    return new Response('Not a conversation exercise', { status: 400 })
  }

  if (!(await hasPlanFeature(tenantId, 'voice_exercises'))) {
    return new Response('Voice exercises are not included in this school’s plan', { status: 403 })
  }

  if (!(await hasCourseAccess(adminClient, user.id, exercise.course_id))) {
    return new Response('You do not have access to this course', { status: 403 })
  }

  const config = parseConversationConfig(exercise.exercise_config)

  // Daily cap — every minted session counts, graded or not, because the
  // minutes are billed either way.
  if (config.max_daily_attempts > 0) {
    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)
    const { count } = await adminClient
      .from('exercise_media_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('exercise_id', exerciseId)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('media_type', 'conversation')
      .gte('created_at', todayStart.toISOString())

    if ((count ?? 0) >= config.max_daily_attempts) {
      return new Response('Daily conversation limit reached', { status: 429 })
    }
  }

  // An abandoned session (tab closed mid-call) must not be graded later as if
  // it were the new one.
  await adminClient
    .from('exercise_media_submissions')
    .update({ status: 'failed' })
    .eq('exercise_id', exerciseId)
    .eq('user_id', user.id)
    .eq('media_type', 'conversation')
    .eq('status', 'pending')

  const { error: insertError } = await adminClient.from('exercise_media_submissions').insert({
    exercise_id: exerciseId,
    user_id: user.id,
    tenant_id: tenantId,
    media_type: 'conversation',
    media_url: '',
    status: 'pending',
  })
  if (insertError) {
    console.error('Realtime session insert failed:', insertError)
    return new Response('Could not start the conversation', { status: 500 })
  }

  try {
    const { token, url } = await openai.experimental_realtime.getToken({
      model: REALTIME_MODEL,
      expiresAfterSeconds: 60,
      sessionConfig: {
        instructions: buildConversationInstructions(exercise, config),
        voice: config.voice,
        outputModalities: ['audio'],
        inputAudioTranscription: { language: config.target_language },
        turnDetection: { type: 'semantic-vad' },
        tools: CONVERSATION_TOOLS,
      },
    })
    // The hook re-sends `tools` in its own session.update on connect; an empty
    // list there would erase the ones embedded in the token.
    return Response.json({ token, url, tools: CONVERSATION_TOOLS })
  } catch (err) {
    console.error('Realtime token error:', err)
    return new Response('Could not start the conversation', { status: 502 })
  }
}
