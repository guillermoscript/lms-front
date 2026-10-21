/**
 * Public origin of a school: its custom domain when it has one
 * (https://academia.guille.tech), otherwise https://{slug}.{platform-domain}.
 * With neither, the platform root.
 */
export function tenantOrigin(tenant: { slug?: string | null; domain?: string | null } | null | undefined): string {
  const domain = tenant?.domain?.trim().toLowerCase()
  if (domain) return `https://${domain}`
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'localhost:3000'
  return tenant?.slug ? `https://${tenant.slug}.${platformDomain}` : `https://${platformDomain}`
}
