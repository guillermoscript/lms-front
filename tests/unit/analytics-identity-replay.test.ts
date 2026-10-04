/**
 * Pins the two things #692 added on top of the analytics wrapper: the
 * session → profile binding helpers, and the replay sample-rate switch.
 * Both are pure, so a wrong parse here would silently mean "every session is
 * a device id" or "the 185 KB recorder ships to everyone / no one".
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  rolesFromAccessToken,
  splitFullName,
  traitsFromSessionUser,
} from '@/lib/analytics/identity'
import {
  getSessionReplayConfig,
  parseReplaySampleRate,
  REPLAY_BLOCK_SELECTOR,
  REPLAY_SCRIPT_PATH,
} from '@/lib/analytics/replay'

const ORIGINAL_ENV = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (s: string) => Buffer.from(s).toString('base64url')
  return `${b64('{"alg":"HS256"}')}.${b64(JSON.stringify(claims))}.sig`
}

describe('splitFullName', () => {
  it('keeps multi-word last names and normalises whitespace', () => {
    expect(splitFullName('  María José   Pérez ')).toEqual({
      firstName: 'María',
      lastName: 'José Pérez',
    })
    expect(splitFullName('Cher')).toEqual({ firstName: 'Cher' })
    expect(splitFullName('')).toEqual({})
    expect(splitFullName(null)).toEqual({})
  })
})

describe('traitsFromSessionUser', () => {
  it('reads name and avatar from user_metadata and never invents fields', () => {
    expect(
      traitsFromSessionUser({
        id: 'u1',
        email: 'ana@example.com',
        user_metadata: { full_name: 'Ana Lima', avatar_url: 'https://x/a.png', junk: 1 },
      })
    ).toEqual({
      firstName: 'Ana',
      lastName: 'Lima',
      email: 'ana@example.com',
      avatar: 'https://x/a.png',
    })
    expect(traitsFromSessionUser({ id: 'u2', email: null, user_metadata: null })).toEqual({})
  })
})

describe('rolesFromAccessToken', () => {
  it('extracts the tenant/global role claims and fails open on garbage', () => {
    expect(rolesFromAccessToken(fakeJwt({ tenant_role: 'teacher', user_role: 'student' }))).toEqual(
      { tenant_role: 'teacher', user_role: 'student' }
    )
    expect(rolesFromAccessToken(fakeJwt({ sub: 'x' }))).toEqual({})
    expect(rolesFromAccessToken('not.a.jwt')).toEqual({})
    expect(rolesFromAccessToken(undefined)).toEqual({})
  })
})

describe('replay sample rate', () => {
  it('defaults to recording everything, and turns off on 0/off', () => {
    expect(parseReplaySampleRate(undefined)).toBe(1)
    expect(parseReplaySampleRate('')).toBe(1)
    expect(parseReplaySampleRate('0.25')).toBe(0.25)
    expect(parseReplaySampleRate('0')).toBe(0)
    expect(parseReplaySampleRate('off')).toBe(0)
    expect(parseReplaySampleRate('7')).toBe(1)
    expect(parseReplaySampleRate('banana')).toBe(1)
  })

  it('builds a config that keeps page text visible but masks every input', () => {
    process.env.NEXT_PUBLIC_OPENPANEL_REPLAY_SAMPLE_RATE = '0.5'
    expect(getSessionReplayConfig()).toEqual({
      enabled: true,
      sampleRate: 0.5,
      maskAllInputs: true,
      maskAllText: false,
      blockSelector: REPLAY_BLOCK_SELECTOR,
      scriptUrl: REPLAY_SCRIPT_PATH,
    })
    expect(REPLAY_SCRIPT_PATH).toBe('/api/op/op1-replay.js')

    process.env.NEXT_PUBLIC_OPENPANEL_REPLAY_SAMPLE_RATE = 'off'
    expect(getSessionReplayConfig().enabled).toBe(false)
  })
})
