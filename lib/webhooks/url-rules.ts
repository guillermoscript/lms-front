/**
 * Pure (no Node builtins) so form validation can run in the browser bundle.
 * WHATWG `URL` has already normalised hostnames (0x7f.1 -> 127.0.0.1), so a
 * strict dotted-quad / colon check is enough here.
 */
const OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
const IPV4 = new RegExp(`^${OCTET}(\\.${OCTET}){3}$`)
export function isIP(host: string): 0 | 4 | 6 {
  if (IPV4.test(host)) return 4
  if (host.includes(':') && /^[0-9a-f:.]+$/i.test(host)) return 6
  return 0
}

/**
 * SSRF guard for webhook targets. The server will POST to whatever URL an owner
 * saves, so it must never reach loopback, link-local (cloud metadata), or
 * private networks. Checked on save AND again at send time (DNS can change).
 *
 * Known residual: DNS rebinding between this lookup and fetch()'s own lookup.
 * Redirects are never followed (see deliver.ts), which closes the common path.
 */

export type UrlGuardResult = { ok: true; url: URL } | { ok: false; reason: 'invalid_url' | 'insecure_url' | 'blocked_host' }

const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home.arpa']

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip)
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number)
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local + metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224 // multicast + reserved
    )
  }
  if (v === 6) {
    const s = ip.toLowerCase()
    if (s === '::' || s === '::1') return true
    if (s.startsWith('fe8') || s.startsWith('fe9') || s.startsWith('fea') || s.startsWith('feb')) return true // fe80::/10
    if (s.startsWith('fc') || s.startsWith('fd')) return true // fc00::/7
    if (s.startsWith('ff')) return true
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    return false
  }
  return true // not an IP at all: treat as unsafe
}

export function allowLocalhost(): boolean {
  // Local n8n (http://localhost:5678) is the dev loop; never in production.
  return process.env.NODE_ENV !== 'production'
}

/** Synchronous, DNS-free checks. Safe for client bundles (form validation) and `assertSafeUrl`. */
export function parseWebhookUrl(raw: string): UrlGuardResult {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return { ok: false, reason: 'invalid_url' }
  }
  if (url.username || url.password) return { ok: false, reason: 'invalid_url' }

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
  if (isLocal && allowLocalhost()) {
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? { ok: true, url }
      : { ok: false, reason: 'invalid_url' }
  }

  if (url.protocol !== 'https:') return { ok: false, reason: 'insecure_url' }
  if (!host.includes('.') && !isIP(host)) return { ok: false, reason: 'blocked_host' }
  if (BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: 'blocked_host' }
  if (isIP(host) && isPrivateIp(host)) return { ok: false, reason: 'blocked_host' }
  return { ok: true, url }
}

