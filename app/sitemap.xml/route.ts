import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const LOCALES = ['en', 'es'] as const

// Locale-less public paths; each is emitted once per locale with hreflang alternates.
const STATIC_PATHS = [
  '',
  '/courses',
  '/products',
  '/pricing',
  '/about',
  '/creators',
  '/platform-pricing',
  '/create-school',
]

/**
 * Tenant-aware sitemap. A route handler (instead of app/sitemap.ts) because
 * URLs must be absolute on the tenant's subdomain and the course list is
 * per-tenant — file conventions have no access to the request host/headers.
 * proxy.ts passes /sitemap.xml through with the x-tenant-id header set.
 */
export async function GET(request: NextRequest) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000'
  const isLocal = host.includes('localhost') || host.includes('lvh.me') || host.includes('127.0.0.1')
  const proto = request.headers.get('x-forwarded-proto') ?? (isLocal ? 'http' : 'https')
  const baseUrl = `${proto}://${host}`
  const tenantId = request.headers.get('x-tenant-id') || DEFAULT_TENANT_ID

  const admin = createAdminClient()
  const { data: courses } = await admin
    .from('courses')
    .select('course_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .limit(5000)

  const paths = [...STATIC_PATHS, ...(courses ?? []).map((c) => `/courses/${c.course_id}`)]

  const entries = paths
    .flatMap((path) =>
      LOCALES.map((locale) => {
        const alternates = LOCALES.map(
          (alt) =>
            `    <xhtml:link rel="alternate" hreflang="${alt}" href="${baseUrl}/${alt}${path}"/>`
        ).join('\n')
        return `  <url>\n    <loc>${baseUrl}/${locale}${path}</loc>\n${alternates}\n  </url>`
      })
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

  return new NextResponse(xml, {
    headers: {
      'content-type': 'application/xml',
      'cache-control': 'public, max-age=3600',
    },
  })
}
