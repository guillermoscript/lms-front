'use server'

import { redirect } from 'next/navigation'

import { createResponse } from '@/utils/functions'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

export const signInWithGitHub = async () => {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
            redirectTo: 'http://localhost:3000/auth/callback',
        },
    })
    if (error) {
        return error
    }
    console.log(data.url)
    if (data.url) {
        redirect(data.url) // use the redirect API for your server framework
    }
    return data
}

export const signInWithFacebook = async () => {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
            redirectTo: 'http://localhost:3000/auth/callback',
        },
    })
    if (error) {
        return error
    }
    console.log(data.url)
    if (data.url) {
        redirect(data.url) // use the redirect API for your server framework
    }
    return data
}

export const signInWithGoogle = async () => {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
            redirectTo: 'http://localhost:3000/auth/callback',
        },
    })
    if (error) {
        return error
    }
    console.log(data.url)
    if (data.url) {
        redirect(data.url) // use the redirect API for your server framework
    }
    return data
}

export const signIn = async ({
    email,
    password,
    redirectTo,
}: {
    email: string
    password: string
    redirectTo?: string
}) => {
    const supabase = createClient()

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        console.log(error)
        return createResponse(
            'error',
            'Invalid credentials',
            null,
            error.message
        )
    }

    const userRole = await getServerUserRole()

    console.log('User role:', userRole)

    // forgive me for the following code
    const [admin, teacher, student] = ['admin', 'teacher', 'student'] as Array<
        Tables<'user_roles'>['role']
    >

    if (userRole === admin) {
        return redirect('/dashboard/admin')
    } else if (userRole === teacher) {
        return redirect('/dashboard/teacher')
    } else if (userRole === student) {
        if (redirectTo === '/dashboard') {
            return redirect('/dashboard/student')
        }
        return redirect(redirectTo || '/dashboard/student')
    }

    console.log(redirectTo)

    redirect(redirectTo || '/dashboard')
}

export const signUp = async (userData: {
    email: string
    password: string
    username: string
    full_name: string
}) => {
    if (
        !userData.email ||
        !userData.password ||
        !userData.username ||
        !userData.full_name
    ) {
        return createResponse('error', 'All fields are required', null, null)
    }

    const supabase = createClient()

    const { error, data } = await supabase.auth.signUp({
        email: userData.email,
        password: userData.password,
        options: {
            data: {
                full_name: userData.full_name,
                username: userData.username,
            },
        },
    })

    if (error) {
        console.log(error)
        return createResponse(
            'error',
            'Error submitting comment',
            null,
            error.message.toString()
        )
    }

    return createResponse(
        'success',
        'Check your email to continue sign in process',
        null,
        null
    )
}

export const resetPasswordFun = async ({
    password,
    code,
}: {
    password: string
    code: string
}) => {
    const supabase = createClient()
    const sessionFromCode = await supabase.auth.exchangeCodeForSession(code)

    if (sessionFromCode.error) {
        return createResponse(
            'error',
            'Error submitting comment',
            null,
            sessionFromCode.error.message.toString()
        )
    }

    const { data, error } = await supabase.auth.updateUser({
        password,
    })

    if (error != null) {
        console.log(error)
        return createResponse(
            'error',
            'Error submitting comment',
            null,
            error.message.toString()
        )
    }

    return createResponse(
        'success',
        'Password updated successfully',
        null,
        null
    )
}

export const forgotPasswordFun = async (data: { email: string }) => {
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo: process.env.NEXT_PUBLIC_DOMAIN_URL + '/auth/reset-password',
    })

    if (error != null) {
        console.log(error)
        return createResponse(
            'error',
            'Error submitting comment',
            null,
            error.message.toString()
        )
    }

    return createResponse(
        'success',
        'Password reset link sent to your email',
        null,
        null
    )
}
