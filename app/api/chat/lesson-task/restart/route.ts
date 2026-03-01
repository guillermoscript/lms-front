import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const tenantId = await getCurrentTenantId()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const { lessonId } = await req.json()

        if (!lessonId) {
            return new NextResponse('Lesson ID is required', { status: 400 })
        }

        // Validate lesson belongs to tenant
        const { data: lesson } = await supabase
            .from('lessons')
            .select('id, course:courses!inner(tenant_id)')
            .eq('id', lessonId)
            .single()

        if (!lesson || (lesson as any).course?.tenant_id !== tenantId) {
            return new NextResponse('Lesson not found', { status: 404 })
        }

        // Delete all messages for this lesson and user
        const { error: messagesError } = await supabase
            .from('lessons_ai_task_messages')
            .delete()
            .eq('lesson_id', lessonId)
            .eq('user_id', user.id)

        if (messagesError) {
            console.error('Error deleting messages:', messagesError)
            return new NextResponse(messagesError.message, { status: 500 })
        }

        // Also delete lesson completion to allow retrying
        const { error: completionError } = await supabase
            .from('lesson_completions')
            .delete()
            .eq('lesson_id', lessonId)
            .eq('user_id', user.id)

        if (completionError) {
            console.error('Error deleting completion:', completionError)
            // Don't fail if completion deletion fails, just log it
        }

        return new NextResponse('Restarted successfully', { status: 200 })
    } catch (err: any) {
        console.error('Restart chat failed:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
