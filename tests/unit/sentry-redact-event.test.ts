import { describe, expect, it } from 'vitest'

import { redactSentryEvent } from '@/lib/sentry/redact-event'

const OPENAI = 'sk-proj-AbCdEf0123456789_xyz-ABC'
const ANTHROPIC = 'sk-ant-api03-AbCdEf0123456789_xyz-ABC'

describe('redactSentryEvent', () => {
  it('masks keys in messages, exception values, breadcrumbs and extra, and keeps the rest readable', () => {
    const event = {
      message: `Incorrect API key provided: ${OPENAI}.`,
      exception: { values: [{ type: 'APICallError', value: `401 for ${ANTHROPIC} on /v1/messages` }] },
      breadcrumbs: [{ message: `fetch https://x.test/?key=AIzaSyA-1234567890abcdefghijklmnopqrstu`, data: { note: 'ok' } }],
      extra: { nested: { deep: [`Bearer abcdefghijklmnop1234`] } },
    }
    const out = JSON.stringify(redactSentryEvent(event))
    expect(out).not.toContain(OPENAI)
    expect(out).not.toContain(ANTHROPIC)
    expect(out).not.toContain('AIzaSyA')
    expect(out).not.toContain('abcdefghijklmnop1234')
    expect(out).toContain('APICallError')
    expect(out).toContain('on /v1/messages')
    expect(out).toContain('"note":"ok"')
  })

  it('blanks credential header values by name, regardless of their shape', () => {
    const event = {
      request: {
        headers: { Authorization: 'whatever', 'x-api-key': 'k', 'X-Goog-Api-Key': 'k2', 'content-type': 'application/json' },
      },
    }
    const out = redactSentryEvent(event)
    expect(out.request.headers.Authorization).toBe('[REDACTED]')
    expect(out.request.headers['x-api-key']).toBe('[REDACTED]')
    expect(out.request.headers['X-Goog-Api-Key']).toBe('[REDACTED]')
    expect(out.request.headers['content-type']).toBe('application/json')
  })

  it('returns the same event, survives cycles and non-plain values', () => {
    const event: Record<string, unknown> = { n: 1, b: true, u: undefined, nil: null, s: `k=${OPENAI}` }
    event.self = event
    expect(redactSentryEvent(event)).toBe(event)
    expect(String(event.s)).not.toContain(OPENAI)
  })
})
