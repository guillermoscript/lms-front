import { createAdminClient } from '@/lib/supabase/admin'
import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { hasCourseAccess } from '@/lib/services/course-access'
import { hasPlanFeature } from '@/lib/plans/server'
import { GRADING_SECRETS_EMBED, withGradingSecrets } from '@/lib/exercises/grading-secrets'
import { aiFailureResponse, canConfigureAi } from '@/lib/exercises/ai-failure'
import { createTenantAi, type TenantRealtime } from '@/lib/ai/tenant-ai'
import { voicesFor } from '@/lib/ai/providers'
import {
  CONVERSATION_OVERRUN_SLACK_SECONDS,
  CONVERSATION_TAB_KEY,
  CONVERSATION_TOOLS,
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
 * what the daily cap counts and what the evaluate route later closes. The row
 * is keyed by the `tab` the browser sends, so two tabs hold two sessions.
 *
 * BYOK: the school's own realtime key mints the token. The key and model are
 * resolved BEFORE any row is written, so a school with no usable key (or a
 * provider without realtime) costs the student no attempt. Only the ephemeral
 * token reaches the browser, together with `{ provider, model, voice }`, from
 * which the client builds its model descriptor (nothing is hardcoded there).
 */
export async function POST(req: Request) {
  const auth = await getApiAuthContext(req)
  if (!auth) return new Response('Unauthorized', { status: 401 })
  const { user, tenantId } = auth
  const adminClient = createAdminClient()

  const params = new URL(req.url).searchParams
  const exerciseId = parseInt(params.get('exerciseId') ?? '')
  const tab = params.get('tab') ?? ''
  if (isNaN(exerciseId) || exerciseId <= 0 || !CONVERSATION_TAB_KEY.test(tab)) {
    return new Response('exerciseId and tab are required', { status: 400 })
  }

  const { data: storedExercise, error } = await adminClient
    .from('exercises')
    .select(`id, title, instructions, system_prompt, exercise_type, exercise_config, course_id, tenant_id, ${GRADING_SECRETS_EMBED}`)
    .eq('id', exerciseId)
    .single()
  // The teacher's notes live outside the student-readable row (#833).
  const exercise = storedExercise ? withGradingSecrets(storedExercise) : null

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

  // Resolve the school's realtime provider/key/model BEFORE the daily cap and
  // before any pending row: a missing or rejected key leaves no side effects.
  const ai = createTenantAi(tenantId, { actorId: user.id })
  const aiFailure = async (err: unknown) =>
    aiFailureResponse(
      err,
      {
        feature: 'voice_conversation',
        canConfigure: await canConfigureAi(auth.supabase, user.id, tenantId),
        tenantId,
        providerId: ai.lastProviderId(),
        actorId: user.id,
      },
      () => new Response('Could not start the conversation', { status: 502 })
    )
  let realtime: TenantRealtime
  try {
    realtime = await ai.getRealtime('voice_conversation')
  } catch (err) {
    return aiFailure(err)
  }
  // The teacher's voice is an OpenAI voice name; another provider rejects it,
  // so fall back to the school's configured voice (or the provider default).
  const voice = voicesFor(realtime.providerId).includes(config.voice) ? config.voice : undefined

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

  // A session belongs to the browser tab that opened it. Starting again in the
  // same tab abandons its previous call, which must not be graded later as if
  // it were the new one. Another tab's live call is left alone — closing it
  // here meant a student with two tabs open could never get the first graded.
  const mine = () =>
    adminClient
      .from('exercise_media_submissions')
      .update({ status: 'failed' })
      .eq('exercise_id', exerciseId)
      .eq('user_id', user.id)
      .eq('media_type', 'conversation')
      .eq('status', 'pending')
  await mine().eq('stt_result->>tab', tab)
  // Whatever outlived its budget can no longer be graded (the evaluate route
  // refuses it) — a tab closed mid-call would otherwise stay pending forever.
  const budgetMs = (config.max_minutes * 60 + CONVERSATION_OVERRUN_SLACK_SECONDS) * 1000
  await mine().lt('created_at', new Date(Date.now() - budgetMs).toISOString())

  const { data: opened, error: insertError } = await adminClient
    .from('exercise_media_submissions')
    .insert({
      exercise_id: exerciseId,
      user_id: user.id,
      tenant_id: tenantId,
      media_type: 'conversation',
      media_url: '',
      status: 'pending',
      // Replaced by the transcript once graded; only needed while pending.
      stt_result: { tab },
    })
    .select('id')
    .single()
  if (insertError || !opened) {
    console.error('Realtime session insert failed:', insertError?.code ?? 'no row')
    return new Response('Could not start the conversation', { status: 500 })
  }

  try {
    const minted = await realtime.getToken(
      {
        instructions: buildConversationInstructions(exercise, config),
        ...(voice ? { voice } : {}),
        outputModalities: ['audio'],
        // Hinted on purpose. Measured 2026-09-20 with synthetic Spanish, accented
        // and mixed clips: the hint barely changes Spanish turns ("Perdón" →
        // "perdon"), while without it short accented English drifts ("I want a" →
        // "Ai wanta"). The grader is told how to read a garbled turn instead.
        inputAudioTranscription: { language: config.target_language },
        turnDetection: { type: 'semantic-vad' },
        tools: CONVERSATION_TOOLS,
      },
      { expiresAfterSeconds: 60 }
    )
    // The hook re-sends `tools` in its own session.update on connect; an empty
    // list there would erase the ones embedded in the token. `provider`/`model`/
    // `voice` are what the client builds its realtime model descriptor from.
    return Response.json(
      {
        token: minted.token,
        url: minted.url,
        tools: CONVERSATION_TOOLS,
        provider: minted.provider,
        model: minted.model,
        voice: minted.voice,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err) {
    // No token, no call: release the attempt this mint just opened, so a
    // provider hiccup does not eat one of the student's daily conversations.
    await adminClient
      .from('exercise_media_submissions')
      .delete()
      .eq('id', opened.id)
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
    return aiFailure(err)
  }
}
