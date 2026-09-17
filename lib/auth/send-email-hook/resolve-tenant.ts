import { createAdminClient } from '@/lib/supabase/admin'

const PLATFORM_HOSTS = ['localhost', '127.0.0.1']

function platformDomain(): string {
  return (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || 'lmsplatform.com').split(':')[0]
}

/**
 * Extract a tenant slug from a URL's HOST, mirroring `getTenantSlugFromHost`
 * in `proxy.ts` (that function is private to the middleware module, so this
 * is a deliberate, small duplicate — not a shared import).
 *
 * Returns `null` on the platform's own domain/localhost, or when the host has
 * no subdomain — same as the middleware.
 */
export function tenantSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null
  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return null
  }

  const domain = platformDomain()
  if (PLATFORM_HOSTS.includes(hostname) || hostname === domain) return null

  if (hostname.endsWith(`.${domain}`)) {
    const slug = hostname.slice(0, -(domain.length + 1))
    if (slug && !slug.includes('.')) return slug
  }
  return null
}

/**
 * Resolve which school an outgoing Auth email (issue #776) should be branded
 * as, in priority order:
 *
 * 1. The subdomain in `redirect_to` — the app always builds that URL from
 *    `window.location.origin`, i.e. the tenant subdomain the visitor was
 *    actually on when they signed up / requested the email.
 * 2. The user's own `preferred_tenant_id` (set by `/auth/confirm` on their
 *    last sign-in) if it is still an active membership.
 * 3. Their oldest active `tenant_users` membership — a "home school" guess
 *    for a magic link or recovery email requested from the platform root.
 *
 * Returns `null` when none of these resolve — the caller falls back to the
 * platform palette (`platformSchoolBrand`), never guesses a tenant.
 */
export async function resolveTenantIdForAuthEmail(params: {
  redirectTo: string | null
  userId: string
  userMetadata: Record<string, unknown> | null | undefined
}): Promise<string | null> {
  const admin = createAdminClient()

  const slug = tenantSlugFromUrl(params.redirectTo)
  if (slug) {
    const { data } = await admin
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()
    if (data?.id) return data.id
  }

  const preferredTenantId =
    typeof params.userMetadata?.preferred_tenant_id === 'string'
      ? (params.userMetadata.preferred_tenant_id as string)
      : null

  if (preferredTenantId) {
    const { data } = await admin
      .from('tenant_users')
      .select('tenant_id')
      .eq('user_id', params.userId)
      .eq('tenant_id', preferredTenantId)
      .eq('status', 'active')
      .maybeSingle()
    if (data?.tenant_id) return data.tenant_id
  }

  const { data: membership } = await admin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', params.userId)
    .eq('status', 'active')
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return membership?.tenant_id ?? null
}
