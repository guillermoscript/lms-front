import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'

// Derive root domain for cross-subdomain cookie sharing
function getCookieDomain(): string | undefined {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
  if (!platformDomain) return undefined
  const domain = platformDomain.split(':')[0]
  if (domain === 'localhost' || domain === '127.0.0.1') return undefined
  return `.${domain}`
}

/**
 * If using Fluid compute: Don't put this client in a global variable. Always create a new client within each
 * function when using it.
 */
export async function createClient() {
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()])
  const cookieDomain = getCookieDomain()
  const tenantId = headersList.get('x-tenant-id')

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      // Forward tenant ID to PostgREST so get_tenant_id() can read it
      // via current_setting('request.header.x-tenant-id'). This is
      // critical for anon users on non-default tenants where the JWT
      // has no tenant_id claim.
      global: {
        headers: {
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
      },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                ...(cookieDomain ? { domain: cookieDomain } : {}),
              })
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
