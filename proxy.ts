import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { getRoleFromClaims } from '@/lib/supabase/get-user-role'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Public routes that don't require authentication
  const publicRoutes = [
    '/auth/login',
    '/auth/sign-up',
    '/auth/sign-up-success',
    '/auth/forgot-password',
    '/auth/update-password',
    '/auth/confirm',
    '/auth/error',
    '/',
  ]

  // Check if the current path is public
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route))

  // Update session (handles auth state)
  const supabaseResponse = await updateSession(request)

  // If it's a public route, allow access
  if (isPublicRoute) {
    return supabaseResponse
  }

  // For protected routes, check authentication
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Not needed here, just for reading
        },
      },
    }
  )

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims

  // If no user and trying to access protected route, redirect to login
  if (!claims) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/auth/login'
    redirectUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // Get user role from claims
  const userRole = getRoleFromClaims(claims)

  // Role-based route protection
  if (pathname.startsWith('/dashboard/student') && userRole !== 'student') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  if (pathname.startsWith('/dashboard/teacher') && userRole !== 'teacher' && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  if (pathname.startsWith('/dashboard/admin') && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  // Redirect /dashboard to the appropriate role-specific dashboard
  if (pathname === '/dashboard') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
