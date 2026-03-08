import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const tenantId = await getCurrentTenantId()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return new Response('Unauthorized', { status: 401 })

    const courseId = req.nextUrl.searchParams.get('courseId')
    if (!courseId) return new Response('Course ID is required', { status: 400 })

    const { data: sessions, error } = await supabase
        .from('aristotle_sessions')
        .select('session_id, summary, topics_discussed, started_at, ended_at')
        .eq('course_id', parseInt(courseId))
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .not('summary', 'is', null)
        .order('started_at', { ascending: false })
        .limit(20)

    if (error) return new Response('Failed to fetch sessions', { status: 500 })

    return Response.json({ sessions: sessions || [] })
}
