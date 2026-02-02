import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
    try {
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return new NextResponse('Unauthorized', { status: 401 })
        }

        const { lessonId } = await req.json()

        if (!lessonId) {
            return new NextResponse('Lesson ID is required', { status: 400 })
        }

        // Delete all messages for this lesson and user
        const { error } = await supabase
            .from('lessons_ai_task_messages')
            .delete()
            .eq('lesson_id', lessonId)
            .eq('user_id', user.id)

        if (error) {
            console.error('Error restarting lesson chat:', error)
            return new NextResponse(error.message, { status: 500 })
        }

        return new NextResponse('Restarted successfully', { status: 200 })
    } catch (err: any) {
        console.error('Restart chat failed:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
