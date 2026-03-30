import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'

// Derive root domain for cross-subdomain cookie sharing
function getCookieDomain(): string | undefined {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
  if (!platformDomain) return undefined
  const domain = platformDomain.split(':')[0]
  if (domain === 'localhost' || domain === '127.0.0.1') return undefined
  return `.${domain}`
}

export async function updateSession(request: NextRequest): Promise<{ response: NextResponse; user: User | null }> {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const cookieDomain = getCookieDomain()

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              ...(cookieDomain ? { domain: cookieDomain } : {}),
            })
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: Only call getUser() when auth cookies exist.
  // Without this check, every unauthenticated request (bots, prefetches, public pages)
  // makes a wasted network call to Supabase Auth — causing thousands of unnecessary
  // requests that burn through rate limits.
  let user: User | null = null
  const hasAuthCookies = request.cookies.getAll().some(c => c.name.startsWith('sb-'))
  if (!hasAuthCookies) {
    return { response: supabaseResponse, user: null }
  }

  const { data, error } = await supabase.auth.getUser()
  user = data.user

  // When the refresh token is invalid/expired, getUser() returns an error with no user.
  // The @supabase/ssr setAll callback may have already fired with the failed session,
  // but we need to explicitly clear all sb-* cookies from the response so the browser
  // deletes them. Without this, the browser's Supabase client will see stale cookies
  // and start an infinite refresh_token retry loop (400 → 429 → 400...).
  if (error && !user) {
    // Clear cookies from both the request (for downstream server components)
    // and the response (for the browser via Set-Cookie headers).
    const sbCookies = request.cookies.getAll().filter(c => c.name.startsWith('sb-'))
    for (const { name } of sbCookies) {
      request.cookies.delete(name)
      supabaseResponse.cookies.set(name, '', {
        maxAge: 0,
        path: '/',
        ...(cookieDomain ? { domain: cookieDomain } : {}),
      })
    }
  }

  return { response: supabaseResponse, user }
}
