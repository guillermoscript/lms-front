import createIntlMiddleware from 'next-intl/middleware'
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'
import { createServerClient } from '@supabase/ssr'
import { locales, defaultLocale } from './i18n'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function checkSuperAdmin(userId: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/super_admins?user_id=eq.${userId}&select=user_id&limit=1`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Accept: 'application/json',
        },
      }
    )
    if (!res.ok) return false
    const rows = await res.json()
    return Array.isArray(rows) && rows.length > 0
  } catch {
    return false
  }
}

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

// Strip port from domain for hostname comparisons
const PLATFORM_DOMAIN_RAW = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com'
const PLATFORM_DOMAIN = PLATFORM_DOMAIN_RAW.split(':')[0] // e.g. "lvh.me" from "lvh.me:3000"

// Domains that are the platform itself (not tenant subdomains)
const PLATFORM_HOSTS = [
  'localhost',
  '127.0.0.1',
  PLATFORM_DOMAIN,
]

// Create i18n middleware
const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

/**
 * Extract tenant slug from subdomain.
 * e.g. "school.lmsplatform.com" -> "school"
 * e.g. "school.lvh.me:3000" -> "school"
 * Returns null if on the platform root domain or localhost without subdomain.
 */
function getTenantSlugFromHost(host: string): string | null {
  const hostname = host.split(':')[0] // Remove port

  // Skip if it's a platform host without subdomain
  if (PLATFORM_HOSTS.some(h => hostname === h)) {
    return null
  }

  // Check for subdomain pattern: slug.platform.com
  if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const slug = hostname.replace(`.${PLATFORM_DOMAIN}`, '')
    if (slug && !slug.includes('.')) {
      return slug
    }
  }

  // For localhost development: check x-tenant-slug header as override
  return null
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/_next')) {
    return NextResponse.next()
  }

  // --- OAuth well-known metadata (RFC 9728) ---
  // Claude Desktop fetches /.well-known/oauth-protected-resource/api/mcp
  // Must return JSON before intl middleware adds locale prefix.
  if (pathname.startsWith('/.well-known/')) {
    if (pathname.startsWith('/.well-known/oauth-protected-resource') ||
        pathname.startsWith('/.well-known/oauth-authorization-server')) {
      const proto = request.headers.get('x-forwarded-proto') || 'https'
      const reqHost = request.headers.get('host') || 'localhost:3000'
      const origin = `${proto}://${reqHost}`
      const mcpBase = `${origin}/api/mcp`

      const isResource = pathname.startsWith('/.well-known/oauth-protected-resource')
      const body = isResource
        ? {
            resource: mcpBase,
            authorization_servers: [mcpBase],
            scopes_supported: ['mcp:tools'],
            bearer_methods_supported: ['header'],
            resource_name: 'LMS MCP Server',
          }
        : {
            issuer: mcpBase,
            authorization_endpoint: `${mcpBase}/auth/authorize`,
            token_endpoint: `${mcpBase}/auth/token`,
            registration_endpoint: `${mcpBase}/auth/register`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
            code_challenge_methods_supported: ['S256'],
            scopes_supported: ['mcp:tools'],
            revocation_endpoint: `${mcpBase}/auth/revoke`,
          }

      return new NextResponse(JSON.stringify(body), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'cache-control': 'public, max-age=3600',
          'access-control-allow-origin': '*',
        },
      })
    }
    // Other .well-known paths — pass through without intl
    return NextResponse.next()
  }

  // --- Tenant Resolution (runs for ALL routes including /api) ---
  const host = request.headers.get('host') || ''
  const tenantSlug = getTenantSlugFromHost(host)
    || request.headers.get('x-tenant-slug') // Dev override
  let tenantId = DEFAULT_TENANT_ID

  if (tenantSlug) {
    // Look up tenant by slug using service client (no auth needed)
    const supabaseLookup = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll() { /* not needed for lookup */ },
        },
      }
    )
    const { data: tenant } = await supabaseLookup
      .from('tenants')
      .select('id, status')
      .eq('slug', tenantSlug)
      .eq('status', 'active')
      .single()

    if (!tenant) {
      // Invalid tenant slug - redirect to platform root (skip for API routes)
      if (pathname.startsWith('/api')) {
        return NextResponse.json({ error: 'Invalid tenant' }, { status: 404 })
      }
      const platformUrl = new URL('/', request.url)
      platformUrl.host = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || request.headers.get('host') || 'localhost:3000'
      return NextResponse.redirect(platformUrl)
    }
    tenantId = tenant.id
  }

  // For API routes: set tenant header and pass through (no intl/auth guards)
  if (pathname.startsWith('/api')) {
    request.headers.set('x-tenant-id', tenantId)
    const response = NextResponse.next({ request })
    response.headers.set('x-tenant-id', tenantId)
    return response
  }

  // --- Inject tenant ID into request headers so server components can read it ---
  request.headers.set('x-tenant-id', tenantId)

  // --- Intl Middleware ---
  const intlResponse = intlMiddleware(request)

  if (intlResponse.headers.get('x-middleware-rewrite')) {
    // It's a rewrite, continue
  } else if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse
  }

  // --- Path normalization ---
  const segments = pathname.split('/')
  const locale = segments[1]
  const cleanPath = locales.includes(locale as any)
    ? `/${segments.slice(2).join('/')}`
    : pathname
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
    '/auth/callback',
    '/create-school',
    '/creators',
    '/join-school',
    '/platform-pricing',
    '/pricing',
    '/verify',
    '/courses',
  ]

  const isPublicRoute = publicRoutes.some(route =>
    normalizedPath === route || normalizedPath.startsWith(route + '/')
  )

  // --- Public routes: skip auth entirely when no cookies ---
  intlResponse.headers.set('x-tenant-id', tenantId)
  const hasAuthCookies = request.cookies.getAll().some(c => c.name.startsWith('sb-'))

  if (isPublicRoute && !hasAuthCookies) {
    // Fast path: unauthenticated user on public page — zero auth API calls
    return intlResponse
  }

  // --- Auth session validation (1 auth API call via getUser()) ---
  // Only runs when auth cookies exist (skip for bots, crawlers, unauthenticated visitors)
  const { response: supabaseResponse, user } = await updateSession(request)
  supabaseResponse.headers.set('x-tenant-id', tenantId)

  // Set user ID header so server components can read it without calling getUser() again
  if (user) {
    request.headers.set('x-user-id', user.id)
    intlResponse.headers.set('x-user-id', user.id)
    supabaseResponse.headers.set('x-user-id', user.id)
  }

  // Read JWT claims from cookie (no network call) — getSession() is a local read
  let userRole: 'student' | 'teacher' | 'admin' = 'student'
  if (user) {
    try {
      // Parse JWT directly from cookie to avoid creating another Supabase client
      const authCookie = request.cookies.getAll().find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
      if (authCookie) {
        const sessionData = JSON.parse(authCookie.value)
        const accessToken = sessionData?.access_token || sessionData?.[0]?.access_token
        if (accessToken) {
          const payload = JSON.parse(atob(accessToken.split('.')[1]))
          userRole = payload.tenant_role || payload.user_role || 'student'
        }
      }
    } catch {
      // Fallback: try chunked cookies (sb-*-auth-token.0, .1, etc.)
      try {
        const chunks = request.cookies.getAll()
          .filter(c => c.name.match(/^sb-.*-auth-token\.\d+$/))
          .sort((a, b) => a.name.localeCompare(b.name))
        if (chunks.length > 0) {
          const combined = chunks.map(c => c.value).join('')
          const sessionData = JSON.parse(combined)
          const accessToken = sessionData?.access_token
          if (accessToken) {
            const payload = JSON.parse(atob(accessToken.split('.')[1]))
            userRole = payload.tenant_role || payload.user_role || 'student'
          }
        }
      } catch {
        // ignore — default to 'student'
      }
    }
  }

  // Auth Guards — public routes
  if (isPublicRoute) {
    if (user && (normalizedPath.startsWith('/auth/login') || normalizedPath.startsWith('/auth/sign-up'))) {
      const dashboardUrl = new URL(`/${locale}/dashboard/${userRole}`, request.url)
      return NextResponse.redirect(dashboardUrl)
    }

    // Copy ALL Set-Cookie headers from supabaseResponse to intlResponse.
    // headers.get('set-cookie') only returns the first header — use getSetCookie()
    // to get all of them. This is critical when clearing multiple sb-* cookies
    // (e.g., auth token + chunked tokens) to stop the client-side refresh loop.
    const setCookieHeaders = supabaseResponse.headers.getSetCookie()
    for (const cookie of setCookieHeaders) {
      intlResponse.headers.append('set-cookie', cookie)
    }
    return intlResponse
  }

  // Protected Routes
  if (!user) {
    const redirectUrl = new URL(`/${locale}/auth/login`, request.url)
    redirectUrl.searchParams.set('redirectTo', normalizedPath)
    return NextResponse.redirect(redirectUrl)
  }

  // Supabase client for DB queries (tenant_users check) — no auth API calls
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          const cookieDomain = (() => {
            const d = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN?.split(':')[0]
            if (!d || d === 'localhost' || d === '127.0.0.1') return undefined
            return `.${d}`
          })()
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
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

  // Check if user is a member of the current tenant and get their tenant role
  if (!normalizedPath.startsWith('/join-school')) {
    const { data: membership } = await supabase
      .from('tenant_users')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .single()

    if (!membership) {
      const joinUrl = new URL(`/${locale}/join-school`, request.url)
      return NextResponse.redirect(joinUrl)
    }

    // Use tenant_users role (authoritative) over JWT claim for routing
    if (membership?.role) {
      userRole = membership.role as 'student' | 'teacher' | 'admin'
    }

    // Sync app_metadata.tenant_id so RLS get_tenant_id() returns the correct value.
    // When JWT tenant_id doesn't match the subdomain, we:
    //   1. Update app_metadata via admin API (so custom_access_token_hook picks it up)
    //   2. Refresh the session so the CURRENT response gets a new JWT with the right tenant_id
    // This costs 2 auth API calls but only runs when there's an actual mismatch.
    try {
      const authCookie = request.cookies.getAll().find(c => c.name.startsWith('sb-') && c.name.endsWith('-auth-token'))
      const chunks = request.cookies.getAll()
        .filter(c => c.name.match(/^sb-.*-auth-token\.\d+$/))
        .sort((a, b) => a.name.localeCompare(b.name))
      let accessToken: string | null = null
      if (authCookie) {
        const sd = JSON.parse(authCookie.value)
        accessToken = sd?.access_token || sd?.[0]?.access_token
      } else if (chunks.length > 0) {
        const sd = JSON.parse(chunks.map(c => c.value).join(''))
        accessToken = sd?.access_token
      }
      const jwtTenantId = accessToken
        ? JSON.parse(atob(accessToken.split('.')[1])).tenant_id
        : null

      if (jwtTenantId !== tenantId) {
        // Step 1: Update app_metadata so the hook includes the right tenant_id
        await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
          method: 'PUT',
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ app_metadata: { tenant_id: tenantId } }),
        })

        // Step 2: Refresh session so the current response cookies get a JWT
        // with the updated tenant_id. This makes RLS work on the FIRST page load
        // after a tenant switch (not just the second).
        await supabase.auth.refreshSession()
      }
    } catch {
      // JWT parsing failed or refresh failed — page will work on next reload
    }
  }

  // Super admin platform guard — /platform/* requires super_admins membership
  if (normalizedPath.startsWith('/platform')) {
    const isSA = await checkSuperAdmin(user.id)
    if (!isSA) {
      const loginUrl = new URL(`/${locale}/auth/login`, request.url)
      return NextResponse.redirect(loginUrl)
    }
    // Allow super admin through — bypass tenant membership checks
    const finalPlatformResponse = intlResponse
    for (const cookie of supabaseResponse.headers.getSetCookie()) {
      finalPlatformResponse.headers.append('set-cookie', cookie)
    }
    finalPlatformResponse.headers.set('x-tenant-id', tenantId)
    return finalPlatformResponse
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

  // Allow access — copy ALL Set-Cookie headers (not just the first one)
  // so refreshed JWT tokens from tenant sync are fully propagated.
  const finalResponse = intlResponse
  for (const cookie of supabaseResponse.headers.getSetCookie()) {
    finalResponse.headers.append('set-cookie', cookie)
  }

  return finalResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|monitoring|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    '/.well-known/:path*',
  ],
}
