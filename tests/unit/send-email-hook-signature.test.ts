import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Webhook } from 'standardwebhooks'
import {
  SendEmailHookSignatureError,
  verifySendEmailHookPayload,
} from '@/lib/auth/send-email-hook/verify-signature'

/**
 * `verifySendEmailHookPayload` guards `app/api/auth/send-email-hook/route.ts`
 * (issue #776) — it is the only thing standing between an unauthenticated
 * POST body and a branded email being sent to whatever address it names.
 */

const SECRET_BASE64 = Buffer.from('a-32-byte-test-secret-for-hook!').toString('base64')
const ORIGINAL_SECRET = process.env.SEND_EMAIL_HOOK_SECRET

function sign(payload: string, secretBase64: string, msgId = 'msg_1', date = new Date()) {
  const wh = new Webhook(secretBase64)
  const signature = wh.sign(msgId, date, payload)
  return {
    'webhook-id': msgId,
    'webhook-timestamp': String(Math.floor(date.getTime() / 1000)),
    'webhook-signature': signature,
  }
}

describe('verifySendEmailHookPayload', () => {
  beforeEach(() => {
    process.env.SEND_EMAIL_HOOK_SECRET = `v1,whsec_${SECRET_BASE64}`
  })

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.SEND_EMAIL_HOOK_SECRET
    else process.env.SEND_EMAIL_HOOK_SECRET = ORIGINAL_SECRET
  })

  it('accepts a correctly signed payload and returns the parsed body', () => {
    const body = JSON.stringify({ user: { id: 'u1', email: 'a@b.com' }, email_data: { email_action_type: 'signup' } })
    const headers = new Headers(sign(body, SECRET_BASE64))

    const result = verifySendEmailHookPayload(body, headers)
    expect(result).toEqual({ user: { id: 'u1', email: 'a@b.com' }, email_data: { email_action_type: 'signup' } })
  })

  it('rejects a tampered payload (signature no longer matches)', () => {
    const body = JSON.stringify({ user: { id: 'u1', email: 'a@b.com' } })
    const headers = new Headers(sign(body, SECRET_BASE64))
    const tampered = body.replace('u1', 'u2')

    expect(() => verifySendEmailHookPayload(tampered, headers)).toThrow(SendEmailHookSignatureError)
  })

  it('rejects a payload signed with the wrong secret', () => {
    const body = JSON.stringify({ user: { id: 'u1' } })
    const wrongSecret = Buffer.from('a-completely-different-secret!!').toString('base64')
    const headers = new Headers(sign(body, wrongSecret))

    expect(() => verifySendEmailHookPayload(body, headers)).toThrow(SendEmailHookSignatureError)
  })

  it('rejects a request missing the webhook-signature headers', () => {
    const body = JSON.stringify({ user: { id: 'u1' } })
    expect(() => verifySendEmailHookPayload(body, new Headers())).toThrow(SendEmailHookSignatureError)
  })

  it('rejects an expired timestamp (replay protection)', () => {
    const body = JSON.stringify({ user: { id: 'u1' } })
    const old = new Date(Date.now() - 60 * 60 * 1000) // 1h old, tolerance is 5m
    const headers = new Headers(sign(body, SECRET_BASE64, 'msg_1', old))

    expect(() => verifySendEmailHookPayload(body, headers)).toThrow(SendEmailHookSignatureError)
  })

  it('throws when SEND_EMAIL_HOOK_SECRET is not configured', () => {
    delete process.env.SEND_EMAIL_HOOK_SECRET
    const body = JSON.stringify({ user: { id: 'u1' } })
    const headers = new Headers(sign(body, SECRET_BASE64))

    expect(() => verifySendEmailHookPayload(body, headers)).toThrow(SendEmailHookSignatureError)
  })

  it('accepts the secret whether or not the v1,whsec_ prefix is present', () => {
    process.env.SEND_EMAIL_HOOK_SECRET = SECRET_BASE64 // no prefix at all
    const body = JSON.stringify({ user: { id: 'u1' } })
    const headers = new Headers(sign(body, SECRET_BASE64))

    expect(verifySendEmailHookPayload(body, headers)).toEqual({ user: { id: 'u1' } })
  })
})
