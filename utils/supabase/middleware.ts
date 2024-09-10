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
                    request.cookies.set({
                        name,
                        value,
                        ...options
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers
                        }
                    })
                    response.cookies.set({
                        name,
                        value,
                        ...options
                    })
                },
                remove(name: string, options: CookieOptions) {
                    request.cookies.set({
                        name,
                        value: '',
                        ...options
                    })
                    response = NextResponse.next({
                        request: {
                            headers: request.headers
                        }
                    })
                    response.cookies.set({
                        name,
                        value: '',
                        ...options
                    })
                }
            }
        }
    )

    // refreshing the auth token
    const userData = await supabase.auth.getUser()

    if (request.nextUrl.pathname.startsWith('/dashboard') && userData.error) {
        return NextResponse.redirect(new URL('/auth/login', request.url))
    }

    const userRole = await getServerUserRole()

    if (request.nextUrl.pathname.startsWith('/dashboard/teacher') && (userRole !== 'teacher' && userRole !== 'admin')) {
        return NextResponse.redirect(new URL('/dashboard/student', request.url))
    }

    if (request.nextUrl.pathname.startsWith('/dashboard/student') && (userRole !== 'student' && userRole !== 'admin')) {
        return NextResponse.redirect(new URL('/dashboard/teacher', request.url))
    }

    // redirect to the dashboard if the user is already logged in
    if (request.nextUrl.pathname.startsWith('/auth') && userData.data.user) {
        return NextResponse.redirect(new URL('/dashboard/' + userRole, request.url))
    }

    if (request.nextUrl.pathname.endsWith('/dashboard') && userData.data.user) {
        return NextResponse.redirect(new URL('/dashboard/' + userRole, request.url))
    }

    return response
}
