function platformDomain(): string | null {
  return process.env.NEXT_PUBLIC_PLATFORM_DOMAIN?.trim() || null
}

/** http for local development hosts (lvh.me, localhost, 127.*), https otherwise. */
function schemeFor(host: string): 'http' | 'https' {
  return /^(lvh\.me|localhost|127\.|[^.]+\.lvh\.me)(:|$|\.)/.test(host) ? 'http' : 'https'
}

/**
 * Public origin of a school: its custom domain when it has one
 * (https://academia.guille.tech), otherwise {slug}.{platform-domain}.
 * With neither, the platform root. Local hosts use http.
 */
export function tenantOrigin(tenant: { slug?: string | null; domain?: string | null } | null | undefined): string {
  const domain = tenant?.domain?.trim().toLowerCase()
  if (domain) return `https://${domain}`
  const root = platformDomain() || 'localhost:3000'
  const host = tenant?.slug ? `${tenant.slug}.${root}` : root
  return `${schemeFor(host)}://${host}`
}

/**
 * Like `tenantOrigin` but for shareable links: never guesses. Throws when the
 * school has no custom domain and the platform domain is not configured.
 */
export function requireTenantOrigin(tenant: { slug?: string | null; domain?: string | null } | null | undefined): string {
  if (!tenant?.domain?.trim() && !(tenant?.slug && platformDomain())) {
    throw new Error('Cannot build the school URL: no custom domain and NEXT_PUBLIC_PLATFORM_DOMAIN is not set')
  }
  return tenantOrigin(tenant)
}
