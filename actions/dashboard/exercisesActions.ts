'use server'
import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export async function deleteExerciseAction(data: { exerciseId: string }) {
    const exerciseId = data.exerciseId

    if (!exerciseId) {
        return createResponse('error', 'Exercise id is required', null, 'Exercise id is required')
    }

    const supabase = createClient()
    const exerciseData = await supabase
        .from('exercises')
        .delete()
        .eq('id', exerciseId)

    if (exerciseData.error) {
        console.log(exerciseData.error)
        return createResponse('error', 'Error deleting exercise', null, 'Error deleting exercise')
    }

    revalidatePath('/dashboard/teacher/courses/[courseId]', 'layout')
    return createResponse('success', 'Exercise deleted successfully', null, null)
}
