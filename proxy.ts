import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { createServerClient } from '@supabase/ssr'
import { locales, defaultLocale } from './i18n'

// Create i18n middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always', // Force prefix to make routing predictable for auth checks
})

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Handle ignore paths (api, static, etc) is done by config matcher, 
  // but we double check API here just in case.
  if (pathname.startsWith('/api') || pathname.startsWith('/_next')) {
    return NextResponse.next()
  }

  // 2. Run Intl Middleware to handle locale routing and rewriting
  // This helps ensure we are working with a consistent URL structure
  const intlResponse = intlMiddleware(request)

  // If intlMiddleware redirects (e.g. / -> /en), we should follow it immediately
  // unless we want to check auth first? 
  // Standard pattern: let intl normalize the URL first.
  if (intlResponse.headers.get('x-middleware-rewrite')) {
    // It's a rewrite, continue to auth check
  } else if (intlResponse.status >= 300 && intlResponse.status < 400) {
    // It's a redirect (e.g. adding locale prefix)
    return intlResponse
  }

  // 3. Auth Logic

  // We need to strip locale to check logic against "clean" paths
  // pathname might look like /en/dashboard
  const pathnameIsMissingLocale = locales.every(
    (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
  );

  // If we are here, next-intl didn't redirect, so we likely have a locale or it's a public path that doesn't need one?
  // But we set localePrefix: 'always', so it should have redirected if missing.

  // Normalize path for auth checks: remove locale
  // e.g. /en/dashboard -> /dashboard
  const segments = pathname.split('/')
  const locale = segments[1]
  // if segments[1] is a locale, remove it
  const cleanPath = locales.includes(locale as any)
    ? `/${segments.slice(2).join('/')}`
    : pathname // Should technically not happen if 'always' prefix is enforcing, unless it's a file

  // Fix cleanPath to ensure it starts with / if empty
  const normalizedPath = cleanPath === '' ? '/' : cleanPath

  // Public routes
  const publicRoutes = [
    '/auth/login',
    '/auth/sign-up',
    '/auth/sign-up-success',
    '/auth/forgot-password',
    '/auth/update-password',
    '/auth/confirm',
    '/auth/error',
    '/',
    '/auth/callback' // Add callback if needed
  ]

  const isPublicRoute = publicRoutes.some(route =>
    normalizedPath === route || normalizedPath.startsWith(route + '/')
  )

  // Update session
  const supabaseResponse = await updateSession(request)

  // Create client to check session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) { /* handled by updateSession */ },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  let userRole: 'student' | 'teacher' | 'admin' = 'student'
  if (session?.access_token) {
    try {
      const payload = JSON.parse(atob(session.access_token.split('.')[1]))
      userRole = payload.user_role || 'student'
    } catch (e) {
      // ignore
    }
  }

  // Auth Guards
  if (isPublicRoute) {
    // If logged in and at login/signup, redirect to dashboard
    if (session && (normalizedPath.startsWith('/auth/login') || normalizedPath.startsWith('/auth/sign-up'))) {
      const dashboardUrl = new URL(`/${locale}/dashboard/${userRole}`, request.url)
      return NextResponse.redirect(dashboardUrl)
    }
    // Return intlResponse to preserve locale cookies/headers, but wait, supabaseResponse sets cookies too.
    // We need to merge them.
    // Actually, supabaseResponse is just a `NextResponse.next()` with cookies set.
    // intlResponse is also a response.
    // It's tricky to merge.
    // Pattern: return intlResponse, but Copy cookies from supabaseResponse?

    // Simplest working pattern for Supabase + (Next-Intl or other MW):
    // 1. intlResponse handles the routing/headers for locale.
    // 2. We copy the set-cookie header from supabaseResponse to intlResponse.

    // Copy cookies from updateSession response to intlResponse
    const supabaseCookies = supabaseResponse.headers.get('set-cookie')
    if (supabaseCookies) {
      intlResponse.headers.set('set-cookie', supabaseCookies)
    }

    return intlResponse
  }

  // Protected Routes
  if (!session) {
    const redirectUrl = new URL(`/${locale}/auth/login`, request.url)
    redirectUrl.searchParams.set('redirectTo', normalizedPath)
    return NextResponse.redirect(redirectUrl)
  }

  // Role Checks
  if (normalizedPath.startsWith('/dashboard/student') && userRole !== 'student') {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/${userRole}`, request.url))
  }
  if (normalizedPath.startsWith('/dashboard/teacher') && userRole !== 'teacher' && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/${userRole}`, request.url))
  }
  if (normalizedPath.startsWith('/dashboard/admin') && userRole !== 'admin') {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/${userRole}`, request.url))
  }
  if (normalizedPath === '/dashboard') {
    return NextResponse.redirect(new URL(`/${locale}/dashboard/${userRole}`, request.url))
  }

  // Allow access, return intlResponse (with supabase cookies)
  const finalResponse = intlResponse;
  const supabaseCookies = supabaseResponse.headers.get('set-cookie')
  if (supabaseCookies) {
    finalResponse.headers.set('set-cookie', supabaseCookies)
  }

  return finalResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
