import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

/**
 * Drives `POST /api/auth/send-email-hook` end-to-end (issue #776) against
 * fakes for signature verification, tenant resolution, branding and the
 * mailer. The two things worth a dedicated route test: the `email_change`
 * dual-dispatch with its reversed token/recipient pairing (a documented
 * GoTrue quirk, github.com/supabase/auth#1744), and that a failure anywhere
 * — bad signature, send failure — surfaces as a non-200 so GoTrue can report
 * it, per the hook's contract.
 */

const state: {
  verifyResult: unknown
  verifyThrows: boolean
  tenantId: string | null
  brandName: string
  sent: Array<{ to: string; subject: string; html: string }>
  sendResult: boolean
} = {
  verifyResult: null,
  verifyThrows: false,
  tenantId: 'tenant-1',
  brandName: 'Acme School',
  sent: [],
  sendResult: true,
}

class FakeSignatureError extends Error {}

vi.mock('@/lib/auth/send-email-hook/verify-signature', () => ({
  SendEmailHookSignatureError: FakeSignatureError,
  verifySendEmailHookPayload: (rawBody: string) => {
    if (state.verifyThrows) throw new FakeSignatureError('bad signature')
    return JSON.parse(rawBody)
  },
}))

vi.mock('@/lib/auth/send-email-hook/resolve-tenant', () => ({
  resolveTenantIdForAuthEmail: async () => state.tenantId,
}))

vi.mock('@/lib/themes/school-brand', () => ({
  getSchoolBrand: async (tenantId: string) => ({
    tenantId,
    name: state.brandName,
    logoUrl: null,
    theme: null,
    outputs: { button: '#000', buttonInk: '#fff', buttonBorder: '#000', brandText: '#000', tint: '#eee', deep: '#000', deepInk: '#fff', deepMuted: '#fff', paper: '#fff', headingFont: null, emailHeadingFontStack: 'sans-serif', themeId: null },
  }),
  platformSchoolBrand: (tenantId: string) => ({
    tenantId,
    name: '',
    logoUrl: null,
    theme: null,
    outputs: { button: '#000', buttonInk: '#fff', buttonBorder: '#000', brandText: '#000', tint: '#eee', deep: '#000', deepInk: '#fff', deepMuted: '#fff', paper: '#fff', headingFont: null, emailHeadingFontStack: 'sans-serif', themeId: null },
  }),
}))

vi.mock('@/lib/email/send', () => ({
  sendEmail: async (options: { to: string; subject: string; html: string }) => {
    state.sent.push(options)
    return state.sendResult
  },
}))

const { POST } = await import('@/app/api/auth/send-email-hook/route')

function makeReq(payload: unknown): NextRequest {
  const body = JSON.stringify(payload)
  return {
    text: () => Promise.resolve(body),
    headers: new Headers({ 'webhook-id': 'msg_1', 'webhook-timestamp': '1', 'webhook-signature': 'v1,sig' }),
  } as unknown as NextRequest
}

const BASE_EMAIL_DATA = {
  token: '123456',
  token_hash: 'th_current_path',
  redirect_to: 'https://acme.lvh.me:3005/auth/confirm?next=%2F',
  site_url: 'https://lmsplatform.com',
}

beforeEach(() => {
  state.verifyThrows = false
  state.tenantId = 'tenant-1'
  state.brandName = 'Acme School'
  state.sent = []
  state.sendResult = true
})

describe('POST /api/auth/send-email-hook', () => {
  it('returns 401 when signature verification fails, and sends nothing', async () => {
    state.verifyThrows = true
    const res = await POST(makeReq({ user: { id: 'u1', email: 'a@b.com' }, email_data: { ...BASE_EMAIL_DATA, email_action_type: 'signup' } }))
    expect(res.status).toBe(401)
    expect(state.sent).toHaveLength(0)
  })

  it('returns 400 for a malformed payload', async () => {
    const res = await POST(makeReq({ nonsense: true }))
    expect(res.status).toBe(400)
    expect(state.sent).toHaveLength(0)
  })

  it('sends a branded email for signup and returns 200 {}', async () => {
    const res = await POST(
      makeReq({ user: { id: 'u1', email: 'student@acme.com' }, email_data: { ...BASE_EMAIL_DATA, email_action_type: 'signup' } })
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].to).toBe('student@acme.com')
    expect(state.sent[0].subject).toContain('Acme School')
  })

  it('accepts an unsupported action type (e.g. reauthentication) without sending, and returns 200', async () => {
    const res = await POST(
      makeReq({ user: { id: 'u1', email: 'a@b.com' }, email_data: { ...BASE_EMAIL_DATA, email_action_type: 'reauthentication' } })
    )
    expect(res.status).toBe(200)
    expect(state.sent).toHaveLength(0)
  })

  it('returns 500 and reports the failure when the mailer fails to send', async () => {
    state.sendResult = false
    const res = await POST(
      makeReq({ user: { id: 'u1', email: 'a@b.com' }, email_data: { ...BASE_EMAIL_DATA, email_action_type: 'signup' } })
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeTruthy()
  })

  it('email_change with both tokens sends two emails with the REVERSED token/recipient pairing', async () => {
    const res = await POST(
      makeReq({
        user: { id: 'u1', email: 'old@acme.com', new_email: 'new@acme.com' },
        email_data: { ...BASE_EMAIL_DATA, email_action_type: 'email_change', token_hash: 'th_for_new_address', token_hash_new: 'th_for_current_address' },
      })
    )
    expect(res.status).toBe(200)
    expect(state.sent).toHaveLength(2)

    const toNew = state.sent.find((s) => s.to === 'new@acme.com')
    const toCurrent = state.sent.find((s) => s.to === 'old@acme.com')
    expect(toNew).toBeTruthy()
    expect(toCurrent).toBeTruthy()
    // th_for_new_address (email_data.token_hash) must end up in the link sent
    // to the NEW address; th_for_current_address (token_hash_new) in the link
    // sent to the CURRENT one.
    expect(toNew!.html).toContain('th_for_new_address')
    expect(toCurrent!.html).toContain('th_for_current_address')
  })

  it('email_change with only token_hash (secure email change disabled) sends one email to the current address', async () => {
    const res = await POST(
      makeReq({
        user: { id: 'u1', email: 'only@acme.com' },
        email_data: { ...BASE_EMAIL_DATA, email_action_type: 'email_change', token_hash: 'th_solo' },
      })
    )
    expect(res.status).toBe(200)
    expect(state.sent).toHaveLength(1)
    expect(state.sent[0].to).toBe('only@acme.com')
    expect(state.sent[0].html).toContain('th_solo')
  })

  it('falls back to the platform brand name when no tenant resolves', async () => {
    state.tenantId = null
    const res = await POST(
      makeReq({ user: { id: 'u1', email: 'a@b.com' }, email_data: { ...BASE_EMAIL_DATA, email_action_type: 'magiclink' } })
    )
    expect(res.status).toBe(200)
    expect(state.sent[0].subject).toContain('LMS Platform')
  })
})
