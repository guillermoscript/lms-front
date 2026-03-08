import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { generateSessionSummary } from '@/lib/ai/aristotle-summary'

export async function POST(req: Request) {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return new Response('Unauthorized', { status: 401 })

    const { courseId } = await req.json()
    if (!courseId) return new Response('Course ID is required', { status: 400 })

    const numericCourseId = parseInt(courseId)

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
        .single()

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
}
