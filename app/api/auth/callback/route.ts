import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth callback route handler.
 * After the user authenticates with a social provider (e.g. Google),
 * Supabase redirects here with a `code` parameter.
 * We exchange the code for a session and redirect to the dashboard.
 *
 * This route is at /api/auth/callback to bypass the intl middleware.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/dashboard/student'

  if (!next.startsWith('/')) {
    next = '/dashboard/student'
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Get the user to determine the correct dashboard redirect
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Get user role from JWT claims for routing
        const { data: { session } } = await supabase.auth.getSession()
        let userRole = 'student'

        if (session?.access_token) {
          try {
            const payload = JSON.parse(atob(session.access_token.split('.')[1]))
            userRole = payload.tenant_role || payload.user_role || 'student'
          } catch {
            // Default to student on parse error
          }
        }

        const redirectTo = next === '/dashboard/student' ? `/dashboard/${userRole}` : next
        const forwardedHost = request.headers.get('x-forwarded-host')
        const isLocalEnv = process.env.NODE_ENV === 'development'

        if (isLocalEnv) {
          return NextResponse.redirect(`${origin}${redirectTo}`)
        } else if (forwardedHost) {
          return NextResponse.redirect(`https://${forwardedHost}${redirectTo}`)
        } else {
          return NextResponse.redirect(`${origin}${redirectTo}`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error?error=Could+not+authenticate+with+provider`)
}
