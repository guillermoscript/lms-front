'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { createResponse } from '@/utils/functions'
import { createClient } from '@/utils/supabase/server'

export const signIn = async (prevData: any, formData: FormData) => {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    })

    if (error) {
        console.log(error)
        return createResponse('error', 'Invalid credentials', null, error.message)
    }

    const userData = await supabase.from('user_roles').select('*').eq('user_id', data?.user?.id).single()

    if (userData?.error) {
        console
        return createResponse('error', 'Error in sign in', null, userData.error.message)
    }

    const userRole = userData?.data.role_id

    // forgive me for the following code
    // TODO: refactor this
    if (userRole === 37) {
        return redirect('/dashboard')
    } else if (userRole === 38) {
        return redirect('/dashboard/teacher')
    } else if (userRole === 39) {
        return redirect('/dashboard/student')
    }
}

export const signUp = async (prevData: any, formData: FormData) => {
    const origin = headers().get('origin')
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const supabase = createClient()

    const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: `${origin}/auth/callback`
        }
    })

    if (error) {
        console.log(error)
        return createResponse('error', 'Error submitting comment', null, error)
    }

    return redirect('/auth/login?message=Check email to continue sign in process')
}
