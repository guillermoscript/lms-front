'use server'

import { revalidatePath } from 'next/cache'

import { updateUserProfileSchema } from '@/components/dashboards/student/account/EditProfileForm'
import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export async function studentSubmitLessonComment (state: {
    comment: string
    lesson_id: number
    parent_comment_id?: number
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
    }

    const studentId = userData.data.user?.id

    const commentInsert = await supabase.from('lesson_comments').insert({
        user_id: studentId,
        lesson_id: state.lesson_id,
        content: state.comment,
        parent_comment_id: state.parent_comment_id,
        created_at: new Date().toISOString()
    })

    if (commentInsert.error) {
        return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
    return createResponse('success', 'Lesson updated successfully', null, null)
}

export async function cancelSubscription ({
    userId,
    planId
}: {
    userId: string
    planId: number
}) {
    console.log('Cancel subscription')
    const supabase = createClient()
    const cancelSubscription = await supabase
        .rpc('cancel_subscription', {
            _user_id: userId,
            _plan_id: planId
        })

    if (cancelSubscription.error != null) {
        console.log(cancelSubscription.error)
        return createResponse('error', 'Error cancelling subscription', null, 'Error cancelling subscription')
    }

    console.log(cancelSubscription)

    revalidatePath('/dashboard/student/account/subscriptions', 'layout')
    return createResponse('success', 'Subscription cancelled successfully', null, null)
}

export async function updateUserProfile ({
    fullName,
    bio,
    avatarUrl
}: updateUserProfileSchema) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error updating profile', null, 'Error updating profile')
    }

    const profileUpdate = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            bio,
            avatar_url: avatarUrl
        })
        .eq('id', userData.data.user?.id)

    if (profileUpdate.error) {
        return createResponse('error', 'Error updating profile', null, 'Error updating profile')
    }

    revalidatePath('/dashboard/student/account/profile', 'layout')
    return createResponse('success', 'Profile updated successfully', null, null)
}
