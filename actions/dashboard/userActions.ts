'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { updateUserProfileSchema } from '@/components/dashboards/student/account/EditProfile'
import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export async function updatePassword(state: {
    newPassword: string
}) {
    const { newPassword } = state
    const client = createClient()
    
    const { error } = await client.auth.updateUser({
        password: newPassword,
    })

    if (error) {
        return createResponse('error', 'Error updating password', null, 'Error updating password')
    }

    revalidatePath('/dashboard')
    return createResponse('success', 'Password updated', null, 'Password updated')
}