'use server'

import { revalidatePath } from 'next/cache'

import { updateUserProfileSchema } from '@/components/dashboards/student/account/EditProfileForm'
import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export async function studentSubmitLessonComment (state: {
    comment: string
    lesson_id: number
    course_id: number
    parent_comment_id?: number
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error no user found', null, 'Error no user found')
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
        return createResponse('error', 'Error creating comment', null, 'Error creating comment')
    }

    // if comment is a reply, then add a new notification for the parent comment owner
    if (state.parent_comment_id) {
        const parentComment = await supabase
            .from('lesson_comments')
            .select('user_id')
            .eq('id', state.parent_comment_id)
            .single()

        if (parentComment.error) {
            return createResponse('error', 'Error searching for parent comment', null, 'Error searching for parent comment')
        }

        const notificationInsert = await supabase.from('notifications').insert({
            user_id: parentComment.data.user_id,
            message: `${state.comment}`,
            link: `/dashboard/student/courses/${state.course_id}/lessons/${state.lesson_id}`,
            shrot_message: `**${userData.data.user?.email}** replied to your comment.`,
            created_at: new Date().toISOString(),
            notification_type: 'comment_reply'
        })

        if (notificationInsert.error) {
            return createResponse('error', 'Error updating lesson', null, 'Error updating lesson')
        }
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

export async function addReactionToComment ({
    commentId,
    reactionType,
    isReactionPresent
}: {
    commentId: number
    reactionType: Tables<'comment_reactions'>['reaction_type']
    isReactionPresent: Tables<'comment_reactions'>
}) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error user not found', null, 'Error user not found')
    }

    if (isReactionPresent) {
        // check if the reaction is the same as the one present
        // if it is, delete the reaction else update the reaction
        const selectedReaction = isReactionPresent.reaction_type
        if (selectedReaction === reactionType) {
            const reactionDelete = await supabase
                .from('comment_reactions')
                .delete()
                .eq('id', isReactionPresent.id)

            if (reactionDelete.error) {
                return createResponse('error', 'Error deleting reaction', null, 'Error deleting reaction')
            }

            revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
            return createResponse('success', 'Reaction deleted successfully', null, null)
        } else {
            const reactionUpdate = await supabase
                .from('comment_reactions')
                .update({
                    reaction_type: reactionType
                })
                .eq('id', isReactionPresent.id)

            if (reactionUpdate.error) {
                return createResponse('error', 'Error updating reaction', null, 'Error updating reaction')
            }

            revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
            return createResponse('success', 'Reaction updated successfully', null, null)
        }
    }

    const studentId = userData.data.user?.id

    const reactionInsert = await supabase.from('comment_reactions').insert({
        user_id: studentId,
        comment_id: commentId,
        reaction_type: reactionType
    })

    if (reactionInsert.error) {
        return createResponse('error', 'Error adding reaction', null, 'Error adding reaction')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
    return createResponse('success', 'Reaction added successfully', null, null)
}

export async function updateComment ({
    commentId,
    content
}: {
    commentId: number
    content: string
}) {
    const supabase = createClient()
    const commentUpdate = await supabase
        .from('lesson_comments')
        .update({
            content
        })
        .eq('id', commentId)

    if (commentUpdate.error) {
        return createResponse('error', 'Error updating comment', null, 'Error updating comment')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
    return createResponse('success', 'Comment updated successfully', null, null)
}

export async function addReview({
    stars,
    text,
    entityId,
    entityType
}: {
    stars: number,
    text: string
    entityId: number
    entityType: Tables<'reviews'>['entity_type']
}) {
    // add review to lesson
    const supabase = createClient()

    const userData = await supabase.auth.getUser()

    if (userData.error) {
        return createResponse('error', 'Error getting user data', null, 'Error getting user data')
    }

    const insertReview = await supabase.from('reviews').insert({
        entity_id: entityId,
        entity_type: entityType,
        rating: stars,
        review_text: text,
        user_id: userData.data.user.id,
        created_at: new Date().toISOString()
    })

    if (insertReview.error) {
        return createResponse('error', 'Error adding review', null, 'Error adding review')
    }

    revalidatePath('/dashboard/student/courses/[courseId]/lessons/[lessonId]', 'layout')
    return createResponse('success', 'Review added successfully', null, null)
}
