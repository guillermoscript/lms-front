'use server'
import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export async function notificationUpdate (notification: Tables<'notifications'>) {
    const supabase = createClient()
    const commentUpdate = await supabase
        .from('notifications')
        .update({
            ...notification
        })
        .eq('notification_id', notification.notification_id)

    if (commentUpdate.error) {
        console.log(commentUpdate.error)
        return createResponse('error', 'Error updating notification', null, 'Error updating notification')
    }

    revalidatePath('/dashboard/student/', 'layout')
    return createResponse('success', 'Notification updated successfully', null, null)
}
