'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { createResponse } from '@/utils/functions'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

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

    const userRole = await getServerUserRole()

    console.log('User role:', userRole)

    // forgive me for the following code
    const [
        admin,
        teacher,
        student
    ] = [
        'admin',
        'teacher',
        'student'
    ] as Array<Tables<'user_roles'>['role']>

    if (userRole === admin) {
        return redirect('/dashboard/admin')
    } else if (userRole === teacher) {
        return redirect('/dashboard/teacher')
    } else if (userRole === student) {
        return redirect('/dashboard/student')
    }

    redirect('/')
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
