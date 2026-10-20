/**
 * Cookie `Domain` attribute for a request host.
 *
 * Platform hosts (`*.preciopana.com`) share one session via `.preciopana.com`.
 * A custom domain (`academia.guille.tech`) is a different registrable domain:
 * a browser rejects a Set-Cookie whose Domain it doesn't belong to, so there
 * the cookie must be host-only (undefined).
 */
export function cookieDomainForHost(host: string | null | undefined): string | undefined {
  const platformDomain = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN?.split(':')[0]
  if (!platformDomain || platformDomain === 'localhost' || platformDomain === '127.0.0.1') {
    return undefined
  }
  // No host info: keep the historical platform-wide behaviour.
  if (!host) return `.${platformDomain}`
  const hostname = host.split(':')[0].toLowerCase()
  if (hostname === platformDomain || hostname.endsWith(`.${platformDomain}`)) {
    return `.${platformDomain}`
  }
  return undefined
}
