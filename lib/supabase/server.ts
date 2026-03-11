import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
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
