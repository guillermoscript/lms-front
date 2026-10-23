import { headers } from 'next/headers'

/**
 * Public URL of a school's site, for "open site" links on the platform panel.
 *
 * `NEXT_PUBLIC_PLATFORM_DOMAIN` carries no port (`lvh.me` locally), so the port
 * and scheme come from the current request: a panel served on `lvh.me:3005`
 * links to `code-academy.lvh.me:3005`, and production links to `https://…`.
 *
 * A school with its own domain (`tenants.domain`, e.g. academia.guille.tech) is
 * reached there, not at `<slug>.<platform domain>`, so pass `customDomain` and the
 * link points at where the school actually lives.
 */
export async function getTenantSiteUrl(slug: string, customDomain?: string | null): Promise<string> {
  const own = customDomain?.trim().toLowerCase()
  if (own) return `https://${own}`
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  const h = await headers()
  const host = h.get('host') ?? ''
  const port = host.includes(':') ? `:${host.split(':')[1]}` : ''
  const isLocal = platformDomain.includes('localhost') || platformDomain.includes('lvh.me')
  const proto = isLocal ? 'http' : (h.get('x-forwarded-proto') ?? 'https')
  const domain = platformDomain.includes(':') ? platformDomain : `${platformDomain}${port}`
  return `${proto}://${slug}.${domain}`
}
