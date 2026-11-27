import { openConversationSession } from '@/lib/exercises/realtime-session'
import { CONVERSATION_TOOLS, buildConversationInstructions } from '@/lib/speech/conversation'

/**
 * Setup endpoint for `experimental_useRealtime` over a provider WebSocket (the
 * hook POSTs here on `connect()` and expects `{ token, url, tools }`). Used for
 * providers without GPT-Live; see `../session/route.ts` for the WebRTC path.
 * Session bookkeeping (plan, access, daily cap, pending row) lives in
 * `openConversationSession`.
 *
 * The tutor's instructions, voice and turn detection are embedded in the
 * ephemeral token from `exercise_config` — the `sessionConfig` the browser
 * sends in the body is deliberately ignored. Only the ephemeral token reaches
 * the browser, with `{ provider, model, voice }` for its model descriptor.
 */
export async function POST(req: Request) {
  return openConversationSession(req, async ({ exercise, config, realtime, voice }) => {
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
    // list there would erase the ones embedded in the token.
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
  })
}
