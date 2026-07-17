import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { fetchTenantLesson } from '@/lib/ai/chat-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
    lessonId: z.coerce.number().int().positive(),
})

export async function POST(req: Request) {
    try {
        const auth = await getApiAuthContext(req)
        if (!auth) {
            return new NextResponse('Unauthorized', { status: 401 })
        }
        const { supabase, user, tenantId } = auth

        const parsed = bodySchema.safeParse(await req.json().catch(() => null))
        if (!parsed.success) {
            return new NextResponse('Invalid request body', { status: 400 })
        }
        const { lessonId } = parsed.data

        // Validate lesson belongs to tenant
        const lesson = await fetchTenantLesson(supabase, lessonId, tenantId, 'id, course:courses!inner(tenant_id)')

        if (!lesson) {
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
            return new NextResponse('Failed to restart', { status: 500 })
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
