import { type CookieOptions, createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

import { getServerUserRole } from './getUserRole'
import { Database } from './supabase'

export async function updateSession(request: NextRequest, response: NextResponse) {
    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value
                },
                set(name: string, value: string, options: CookieOptions) {
                    response.cookies.set({ name, value, ...options })
                },
                remove(name: string, options: CookieOptions) {
                    response.cookies.set({ name, value: '', ...options })
                }
            }
        }
    )

    // Refreshing the authentication token
    const { data: userData, error: userError } = await supabase.auth.getUser()

    const localePattern = /^\/(en|es|po|fr|de|it|pt|ru|zh|ja|ko)/ // Add more locales as needed
    const pathname = request.nextUrl.pathname.replace(localePattern, '')

    if (pathname.includes('dashboard') && (!userData || userError)) {
        // Redirect to login if user is not authenticated
        return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    const userRole = await getServerUserRole()

    if (userRole) {
        if (pathname.startsWith('/dashboard/teacher') &&
            (userRole !== 'teacher' && userRole !== 'admin')) {
            // Redirect non-teachers to student dashboard
            return NextResponse.redirect(new URL('/dashboard/student', request.url))
        }

        if (pathname.startsWith('/dashboard/student') &&
            (userRole !== 'student' && userRole !== 'admin')) {
            // Redirect non-students to teacher dashboard
            return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
        }
    }

    if (!userError) {
        if (userData.user.id && pathname.startsWith('/auth')) {
            // Redirect logged in users from auth pages to their dashboard
            return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
        }

        if (userData.user.id && pathname.endsWith('/dashboard')) {
            // Redirect to user role specific dashboard
            return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
        }
    }

    return response
}
