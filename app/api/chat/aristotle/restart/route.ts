import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { generateSessionSummary } from '@/lib/ai/aristotle-summary'
import { createTenantAi } from '@/lib/ai/tenant-ai'
import { classifyProviderError, markCredentialInvalid } from '@/lib/ai/errors'
import { z } from 'zod'

const bodySchema = z.object({
    courseId: z.coerce.number().int().positive(),
})

export async function POST(req: Request) {
    try {
        const auth = await getApiAuthContext(req)
        if (!auth) return new Response('Unauthorized', { status: 401 })
        const { supabase, user, tenantId } = auth

        const parsed = bodySchema.safeParse(await req.json().catch(() => null))
        if (!parsed.success) return new Response('Invalid request body', { status: 400 })
        const numericCourseId = parsed.data.courseId

        // Find active session
        const { data: activeSession } = await supabase
            .from('aristotle_sessions')
            .select('session_id')
            .eq('course_id', numericCourseId)
            .eq('user_id', user.id)
            .eq('tenant_id', tenantId)
            .is('ended_at', null)
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (activeSession) {
            // Fetch messages for summary generation
            const { data: messages } = await supabase
                .from('aristotle_messages')
                .select('role, content')
                .eq('session_id', activeSession.session_id)
                .order('created_at')

            // Generate summary if there were messages
            if (messages && messages.length > 0) {
                // The summary is a nicety, never a blocker: with no usable key (or
                // any failure generating it) the session still closes, summary = null.
                let summary: string | null = null
                let topics: string[] = []
                const ai = createTenantAi(tenantId, { actorId: user.id })
                try {
                    const { model } = await ai.getModelForFeature('aristotle_summary', { courseId: numericCourseId })
                    const generated = await generateSessionSummary(messages, model)
                    summary = generated.summary
                    topics = generated.topics
                } catch (e) {
                    const err = classifyProviderError(e, { feature: 'aristotle_summary', providerId: ai.lastProviderId() })
                    console.error('[aristotle-restart] summary skipped', err.code, err.upstreamStatus ?? '-')
                    if (err.code === 'ai_key_invalid' && ai.lastProviderId()) {
                        await markCredentialInvalid(tenantId, ai.lastProviderId()!, 'aristotle_summary', user.id)
                    }
                }

                await supabase
                    .from('aristotle_sessions')
                    .update({
                        ended_at: new Date().toISOString(),
                        summary,
                        topics_discussed: summary ? topics : null,
                    })
                    .eq('session_id', activeSession.session_id)
            } else {
                // No messages — just close the session
                await supabase
                    .from('aristotle_sessions')
                    .update({ ended_at: new Date().toISOString() })
                    .eq('session_id', activeSession.session_id)
            }
        }

        return Response.json({ success: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        console.error('Restart aristotle session failed:', err)
        return new Response('Internal Server Error', { status: 500 })
    }
}
