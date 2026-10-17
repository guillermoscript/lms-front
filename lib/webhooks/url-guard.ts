import { lookup } from 'dns/promises'
import { allowLocalhost, isIP, isPrivateIp, parseWebhookUrl, type UrlGuardResult } from './url-rules'

export { isPrivateIp, parseWebhookUrl, type UrlGuardResult }

/** Full check including DNS resolution. */
export async function assertSafeUrl(raw: string): Promise<UrlGuardResult> {
  const parsed = parseWebhookUrl(raw)
  if (!parsed.ok) return parsed

  const host = parsed.url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
  if ((isLocal && allowLocalhost()) || isIP(host)) return parsed

  try {
    const addrs = await lookup(host, { all: true })
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
      return { ok: false, reason: 'blocked_host' }
    }
  } catch {
    return { ok: false, reason: 'blocked_host' }
  }
  return parsed
}
