import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { generateSessionSummary } from '@/lib/ai/aristotle-summary'
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
                const { summary, topics } = await generateSessionSummary(messages)

                await supabase
                    .from('aristotle_sessions')
                    .update({
                        ended_at: new Date().toISOString(),
                        summary,
                        topics_discussed: topics,
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
    } catch (err: any) {
        console.error('Restart aristotle session failed:', err)
        return new Response('Internal Server Error', { status: 500 })
    }
}
