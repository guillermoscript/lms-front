import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Tenant-aware robots.txt. Served as a route handler (instead of app/robots.ts)
 * because the sitemap URL must be absolute and tenant-subdomain aware — file
 * conventions have no access to the request host.
 * proxy.ts passes /robots.txt through without intl/auth handling.
 */
export function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000'
  const isLocal = host.includes('localhost') || host.includes('lvh.me') || host.includes('127.0.0.1')
  const proto = request.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https')
  const baseUrl = `${proto}://${host}`

  // Wildcard variants cover the /en/ and /es/ locale prefixes.
  const disallowed = ['/dashboard', '/platform', '/onboarding', '/oauth', '/auth', '/checkout', '/api']
  const rules = disallowed
    .flatMap((path) => [`Disallow: ${path}/`, `Disallow: /*${path}/`])
    .join('\n')

  const body = `User-agent: *\nAllow: /\n${rules}\n\nSitemap: ${baseUrl}/sitemap.xml\n`

  return new NextResponse(body, {
    headers: {
      'content-type': 'text/plain',
      'cache-control': 'public, max-age=3600',
    },
  })
}
