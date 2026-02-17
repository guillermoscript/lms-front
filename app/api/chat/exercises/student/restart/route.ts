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

        const { exerciseId } = await req.json()

        if (!exerciseId) {
            return new NextResponse('Exercise ID is required', { status: 400 })
        }

        // Validate exercise belongs to tenant
        const { data: exercise } = await supabase
            .from('exercises')
            .select('id, course:courses!inner(tenant_id)')
            .eq('id', exerciseId)
            .single()

        if (!exercise || (exercise as any).course?.tenant_id !== tenantId) {
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
            return new NextResponse(error.message, { status: 500 })
        }

        return new NextResponse('Restarted successfully', { status: 200 })
    } catch (err: any) {
        console.error('Restart exercise chat failed:', err)
        return new NextResponse('Internal Server Error', { status: 500 })
    }
}
