/**
 * The guard behind every provider test seam (`PAYPAL_API_BASE`,
 * `BINANCE_PAY_API_BASE`): an override host is honoured only when it is
 * loopback, because the requests it receives carry live credentials.
 */

/** `http(s)://` on 127.0.0.0/8, ::1 or localhost — nothing else can be a test stub. */
export function isLoopbackOrigin(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  const host = url.hostname.replace(/^\[|\]$/g, '') // an IPv6 literal arrives bracketed
  return host === 'localhost' || host === '::1' || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
}
