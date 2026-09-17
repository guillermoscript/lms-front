import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookup } from 'node:dns/promises'
import { fetchImageAsDataUrl } from '@/lib/og/fetch-image'

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
const lookupMock = vi.mocked(lookup) as unknown as ReturnType<typeof vi.fn>

/**
 * Unit tests for `lib/og/fetch-image.ts` (issue #765): the SSRF/size/type
 * guard around fetching a school's logo or a course thumbnail for `/api/og`.
 * `global.fetch` and DNS are mocked — no real network traffic.
 */

const ORIGINAL_FETCH = global.fetch

function pngResponse(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers: { 'content-type': 'image/png', ...headers } })
}

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { location } })
}

beforeEach(() => {
  lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  global.fetch = ORIGINAL_FETCH
})

describe('fetchImageAsDataUrl', () => {
  it('in production, rejects a hostname that resolves to a private address', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    lookupMock.mockResolvedValue([{ address: '10.0.0.7', family: 4 }])
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    expect(await fetchImageAsDataUrl('https://internal.example.com/logo.png')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns a data URL for a plain https image (happy path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(pngResponse('fake-png-bytes'))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/logo.png')

    expect(result).toMatch(/^data:image\/png;base64,/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect to a private IP in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn().mockResolvedValueOnce(redirectResponse('https://192.168.1.5/evil.png'))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/logo.png')

    expect(result).toBeNull()
    // The private-IP hop must never be fetched.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a body over the size cap even without a trustworthy content-length', async () => {
    const bigChunk = new Uint8Array(1024 * 1024) // 1MB per chunk, 2 chunks > 1.5MB cap
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bigChunk)
        controller.enqueue(bigChunk)
        controller.close()
      },
    })
    const response = new Response(stream, { status: 200, headers: { 'content-type': 'image/png' } })
    global.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/huge.png')

    expect(result).toBeNull()
  })

  it('rejects a disallowed content-type', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(pngResponse('<svg></svg>', { 'content-type': 'image/svg+xml' })) as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/logo.svg')

    expect(result).toBeNull()
  })

  it('rejects a plain http URL in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('http://cdn.example.com/logo.png')

    expect(result).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects localhost and loopback/private IP literals in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn()
    global.fetch = fetchMock as unknown as typeof fetch

    for (const url of [
      'https://localhost/logo.png',
      'https://127.0.0.1/logo.png',
      'https://10.0.0.5/logo.png',
      'https://[::1]/logo.png',
      'https://169.254.1.1/logo.png',
    ]) {
      expect(await fetchImageAsDataUrl(url), url).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('follows at most two redirects and then gives up', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.com/hop1.png'))
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.com/hop2.png'))
      .mockResolvedValueOnce(redirectResponse('https://cdn.example.com/hop3.png'))
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/start.png')

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns null instead of throwing when fetch rejects', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    const result = await fetchImageAsDataUrl('https://cdn.example.com/logo.png')

    expect(result).toBeNull()
  })

  it('returns null for an unparseable URL', async () => {
    const result = await fetchImageAsDataUrl('not a url')
    expect(result).toBeNull()
  })
})
