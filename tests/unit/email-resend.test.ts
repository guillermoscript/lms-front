import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from '@/lib/email/send'

const email = { to: 'delivered@resend.dev', subject: 'Recovery', html: '<p>Reset</p>', idempotencyKey: 'auth/retry-1' }

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_private_test')
  vi.stubEnv('EMAIL_FROM', 'School <noreply@example.com>')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('Resend transport', () => {
  it('uses the private key, correct REST fields, and a stable idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ id: 'email-1' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(email)).toBe(true)
    const [url, request] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(request.headers.Authorization).toBe('Bearer re_private_test')
    expect(request.headers['Idempotency-Key']).toBe('auth/retry-1')
    expect(JSON.parse(request.body)).toEqual({ from: 'School <noreply@example.com>', to: [email.to], subject: email.subject, html: email.html, reply_to: 'School <noreply@example.com>' })
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('re_private_test')
  })

  it('rejects an incomplete sender before sending any request', async () => {
    vi.stubEnv('EMAIL_FROM', 'example.com')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(email)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports provider rejection without leaking the response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 're_private_test delivered@resend.dev' }, { status: 403 })))
    expect(await sendEmail(email)).toBe(false)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/re_private_test|delivered@resend/)
  })

  it('requires a provider message id, not merely HTTP 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({})))
    expect(await sendEmail(email)).toBe(false)
  })

  it('propagates timeout as a failed send, never success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))
    expect(await sendEmail(email)).toBe(false)
  })
})
