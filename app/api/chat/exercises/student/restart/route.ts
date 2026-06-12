import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { fetchTenantExercise } from '@/lib/ai/chat-helpers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const bodySchema = z.object({
    exerciseId: z.coerce.number().int().positive(),
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
        const { exerciseId } = parsed.data

        // Validate exercise belongs to tenant
        const exercise = await fetchTenantExercise(supabase, exerciseId, tenantId, 'id, course:courses!inner(tenant_id)')

        if (!exercise) {
            return new NextResponse('Exercise not found', { status: 404 })
        }

        // Delete all messages for this exercise and user
        const { error } = await supabase
            .from('exercise_messages')
            .delete()
            .eq('exercise_id', exerciseId)
            .eq('user_id', user.id)

        if (error) {
            console.error('Error restarting exercise chat:', error)
            return new NextResponse('Failed to restart', { status: 500 })
        }

        return new NextResponse('Restarted successfully', { status: 200 })
    } catch (err: any) {
        console.error('Restart exercise chat failed:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
