import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { getRoleFromClaims } from '@/lib/supabase/get-user-role'
import { createServerClient } from '@supabase/ssr'
import { locales, defaultLocale } from './i18n'

// Create i18n middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'as-needed',
})

// Next.js 16: Function renamed from 'middleware' to 'proxy'
export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  console.log('Proxy trace:', pathname)

  // Check if the current path is public (ignore locale prefix)
  const pathnameWithoutLocale = pathname.replace(/^\/(en|es)/, '')

  // Public routes that don't require authentication
  const publicRoutes = [
    '/auth/login',
    '/en/auth/login',
    '/es/auth/login',
    '/auth/sign-up',
    '/auth/sign-up-success',
    '/auth/forgot-password',
    '/auth/update-password',
    '/auth/confirm',
    '/auth/error',
    '/',
  ]

  const isPublicRoute = publicRoutes.some(route =>
    pathnameWithoutLocale === route || pathnameWithoutLocale.startsWith(route)
  )

  // Update session (handles auth state)
  const supabaseResponse = await updateSession(request)

  // If it's a public route, just update session and continue
  if (isPublicRoute) {
    // For now, skip i18n until app structure supports [locale]
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
  if (pathnameWithoutLocale.startsWith('/dashboard/student') && userRole !== 'student') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  if (pathnameWithoutLocale.startsWith('/dashboard/teacher') && userRole !== 'teacher' && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  if (pathnameWithoutLocale.startsWith('/dashboard/admin') && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  // Redirect /dashboard to the appropriate role-specific dashboard
  if (pathnameWithoutLocale === '/dashboard') {
    return NextResponse.redirect(new URL(`/dashboard/${userRole}`, request.url))
  }

  // Apply i18n to protected routes
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
