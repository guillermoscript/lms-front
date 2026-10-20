import { createBrowserClient } from '@supabase/ssr'
import { cookieDomainForHost } from '@/lib/tenant/cookie-domain'

export function createClient() {
  const cookieDomain =
    typeof window === 'undefined' ? undefined : cookieDomainForHost(window.location.host)

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    {
      cookieOptions: cookieDomain
        ? { domain: cookieDomain, path: '/' }
        : undefined,
    }
  )
}
