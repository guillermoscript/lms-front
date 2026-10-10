import { describe, expect, it } from 'vitest'
import { AI_ERROR_CODES, AI_ERROR_HTTP_STATUS } from '@/lib/ai/error-codes'
import { classifyMediaSubmitFailure, mediaAnalyzeRetry } from '@/lib/exercises/media-submit-error'

const typed = (code: string, canConfigure = false) =>
  JSON.stringify({
    error: { code, feature: 'speech_stt', canConfigure, settingsUrl: canConfigure ? '/dashboard/admin/settings/ai' : null },
  })

describe('classifyMediaSubmitFailure', () => {
  it.each(AI_ERROR_CODES)('%s is the school AI notice on either step', (code) => {
    for (const step of ['upload-url', 'analyze'] as const) {
      expect(classifyMediaSubmitFailure(step, AI_ERROR_HTTP_STATUS[code], typed(code))).toEqual({
        kind: 'ai',
        error: { code, canConfigure: false, settingsUrl: null },
      })
    }
  })

  it('keeps the settings link for a school admin only', () => {
    expect(classifyMediaSubmitFailure('upload-url', 402, typed('ai_not_configured', true))).toEqual({
      kind: 'ai',
      error: { code: 'ai_not_configured', canConfigure: true, settingsUrl: '/dashboard/admin/settings/ai' },
    })
  })

  it('tells the daily cap from a provider quota, both 429', () => {
    const daily = JSON.stringify({ error: 'daily_limit_reached', limit: 5, message: 'Daily attempt limit reached' })
    expect(classifyMediaSubmitFailure('upload-url', 429, daily)).toEqual({ kind: 'daily_limit' })
    expect(classifyMediaSubmitFailure('upload-url', 429, typed('ai_quota')).kind).toBe('ai')
  })

  it('the other upload-url 429 is the flood guard on submissions still in flight', () => {
    const body = 'Too many pending submissions. Please wait for current ones to complete.'
    expect(classifyMediaSubmitFailure('upload-url', 429, body)).toEqual({ kind: 'too_many_pending' })
    expect(classifyMediaSubmitFailure('analyze', 429, body)).toEqual({ kind: 'generic' })
  })

  it('a 403 is a lost course entitlement', () => {
    expect(classifyMediaSubmitFailure('upload-url', 403, 'You are not enrolled in this course')).toEqual({ kind: 'no_access' })
    expect(classifyMediaSubmitFailure('analyze', 403, 'You do not have access to this course')).toEqual({ kind: 'no_access' })
  })

  it('anything else is generic, and no body text survives', () => {
    const bodies: [number, string][] = [
      [500, JSON.stringify({ error: { code: 'analysis_failed' } })],
      [422, JSON.stringify({ error: { code: 'audio_unavailable' } })],
      [409, 'This submission is already being analyzed'],
      [401, 'Unauthorized'],
      [500, ''],
      [502, '<html>Bad gateway</html>'],
      [500, 'null'],
    ]
    for (const [status, body] of bodies) {
      expect(classifyMediaSubmitFailure('analyze', status, body)).toEqual({ kind: 'generic' })
    }
  })
})

describe('mediaAnalyzeRetry', () => {
  const retryAfter = (status: number, body: string) =>
    mediaAnalyzeRetry(status, classifyMediaSubmitFailure('analyze', status, body))

  // The row behind a refused analyze already counted against the daily cap.
  // Whatever the school's AI refused must be re-analyzed on that same row, not
  // uploaded again as a new attempt (#958).
  it.each(AI_ERROR_CODES)('%s keeps the recording for another analysis', (code) => {
    expect(retryAfter(AI_ERROR_HTTP_STATUS[code], typed(code))).toBe('retry')
  })

  it('a 409 is a run still in flight: keep the recording, do not upload it again', () => {
    expect(retryAfter(409, 'This submission is already being analyzed')).toBe('busy')
    expect(retryAfter(409, 'Submission is already being processed')).toBe('busy')
  })

  it('a terminal, missing or forbidden row is gone', () => {
    const answers: [number, string][] = [
      [400, 'This submission cannot be analyzed'],
      [404, 'Submission not found'],
      [403, 'You do not have access to this course'],
      [401, 'Unauthorized'],
      [500, JSON.stringify({ error: { code: 'analysis_failed' } })],
      [422, JSON.stringify({ error: { code: 'audio_unavailable' } })],
    ]
    for (const [status, body] of answers) expect(retryAfter(status, body)).toBe('gone')
  })
})
