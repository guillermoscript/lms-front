'use server'
import { revalidatePath } from 'next/cache'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export interface ApiResponse<T> {
    status: 'success' | 'error' | 'idle'
    message: string
    data?: T
    error?: any
}

export const updateProfile = async (formData: FormData) => {
    const supabase = createClient()

    const {
        data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
        return createResponse('error', 'You must be logged in to submit a comment', null)
    }

    if (!formData) {
        return createResponse('error', 'No form data was submitted', null)
    }

    if (!formData.get('name')) {
        return createResponse('error', 'No name was submitted', null)
    }

    if (!formData.get('bio')) {
        return createResponse('error', 'No bio was submitted', null)
    }

    if (!formData.get('photo')) {
        return createResponse('error', 'No photo was submitted', null)
    }

    const { data, error } = await supabase
        .from('profiles')
        .update({
            bio: formData.get('bio') as string,
            full_name: formData.get('name') as string,
            avatar_url: formData.get('photo') as string
        })
        .eq('id', user?.id)

    if (error) {
        console.log(error)
    }

    if (data) {
        console.log(data)
        revalidatePath('/dashboard/account')
    }
    return data
}
