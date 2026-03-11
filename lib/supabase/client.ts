import { createBrowserClient } from '@supabase/ssr'

// Derive root domain for cross-subdomain cookie sharing (e.g. ".lvh.me" or ".lmsplatform.com")
function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN
  if (!platformDomain) return undefined
  // Strip port (e.g. "lvh.me:3000" → "lvh.me")
  const domain = platformDomain.split(':')[0]
  if (domain === 'localhost' || domain === '127.0.0.1') return undefined
  return `.${domain}`
}

export function createClient() {
  const cookieDomain = getCookieDomain()

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
