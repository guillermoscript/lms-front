/**
 * Fetches a remote image (a school's logo, a course thumbnail) into a `data:`
 * URL for satori (`/api/og`, issue #765) — satori cannot load a remote URL
 * itself, and the source is a database column an admin typed in, so it is
 * treated as attacker-controlled input, not a trusted asset.
 *
 * Guards: http(s) only; in production, https only and no `localhost` or
 * loopback/private/link-local/unique-local address, whether a literal or what
 * the hostname resolves to (SSRF against the server's own network — a DNS
 * rebind between lookup and fetch is out of scope for a logo); at most two redirects, each hop re-validated the same
 * way; a ~3s timeout; only `image/png`, `image/jpeg`, `image/gif` (satori's
 * supported embedded types); the body capped at ~1.5MB while streaming, since
 * a hostile `content-length` cannot be trusted.
 *
 * Never throws — any failure returns `null` and the card renders without the
 * image.
 */

import { lookup } from 'node:dns/promises'
import net from 'node:net'

const FETCH_TIMEOUT_MS = 3000
const MAX_BYTES = 1.5 * 1024 * 1024
const MAX_REDIRECTS = 2
const ALLOWED_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function isPrivateOrLoopbackV4(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 127) return true // loopback
  if (a === 10) return true // private
  if (a === 172 && b >= 16 && b <= 31) return true // private
  if (a === 192 && b === 168) return true // private
  if (a === 169 && b === 254) return true // link-local
  if (a === 100 && b >= 64 && b <= 127) return true // carrier-grade NAT
  if (a === 0) return true // "this network" — not routable
  return false
}

function isPrivateOrLoopbackV6(ip: string): boolean {
  const v = ip.toLowerCase()
  if (v === '::1' || v === '::') return true // loopback / unspecified
  if (v.startsWith('fe80:')) return true // link-local
  if (v.startsWith('fc') || v.startsWith('fd')) return true // unique local fc00::/7
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v)
  if (mapped) return isPrivateOrLoopbackV4(mapped[1])
  return false
}

/** True when a *literal* IP hostname (or `localhost`) points inward. */
function isBlockedLiteralHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost') return true
  const version = net.isIP(host)
  if (version === 4) return isPrivateOrLoopbackV4(host)
  if (version === 6) return isPrivateOrLoopbackV6(host)
  return false
}

async function isAllowedHop(url: URL): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (process.env.NODE_ENV !== 'production') return true
  if (url.protocol !== 'https:') return false
  if (isBlockedLiteralHost(url.hostname)) return false
  if (net.isIP(url.hostname.replace(/^\[|\]$/g, ''))) return true
  try {
    const addresses = await lookup(url.hostname, { all: true })
    return addresses.length > 0 && !addresses.some(({ address }) => isBlockedLiteralHost(address))
  } catch {
    return false
  }
}

/** Reads a stream up to `maxBytes`; `null` if it overflows or errors. */
async function readCapped(body: ReadableStream<Uint8Array>, maxBytes: number): Promise<Buffer | null> {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
  } catch {
    return null
  }
  return Buffer.concat(chunks)
}

/** Fetches `rawUrl` and returns a `data:` URL for satori, or `null` on any failure. */
export async function fetchImageAsDataUrl(rawUrl: string): Promise<string | null> {
  let current: URL
  try {
    current = new URL(rawUrl)
  } catch {
    return null
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!(await isAllowedHop(current))) return null

      let response: Response
      try {
        response = await fetch(current, {
          signal: controller.signal,
          redirect: 'manual',
          headers: { accept: 'image/png,image/jpeg,image/gif' },
        })
      } catch {
        return null
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location || hop === MAX_REDIRECTS) return null
        try {
          current = new URL(location, current)
        } catch {
          return null
        }
        continue
      }

      if (!response.ok || !response.body) return null

      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!ALLOWED_CONTENT_TYPES.has(contentType)) return null

      const bytes = await readCapped(response.body, MAX_BYTES)
      if (!bytes) return null

      return `data:${contentType};base64,${bytes.toString('base64')}`
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}
