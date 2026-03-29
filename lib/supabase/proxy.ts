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
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
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

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (e: any) {
    // If refresh token is invalid/expired, clear auth cookies so we stop retrying
    if (e?.code === 'refresh_token_not_found' || e?.message?.includes('Refresh Token Not Found')) {
      const cookieNames = request.cookies.getAll()
        .map(c => c.name)
        .filter(name => name.startsWith('sb-'))
      for (const name of cookieNames) {
        request.cookies.delete(name)
        supabaseResponse.cookies.delete(name)
      }
    }
  }

  return { response: supabaseResponse, user }
}
