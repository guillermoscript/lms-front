import { describe, expect, it } from 'vitest'
import { generateInviteToken, parseInviteToken, withInviteToken } from '@/lib/tenant/invitation-token'

describe('invitation token', () => {
  it('generates 64 hex chars, unique each time', () => {
    const a = generateInviteToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(generateInviteToken()).not.toBe(a)
  })

  it('accepts only hex of a sane length, lowercased', () => {
    expect(parseInviteToken('A'.repeat(64))).toBe('a'.repeat(64))
    for (const bad of [undefined, null, 42, '', 'abc', 'g'.repeat(64), 'a'.repeat(200), `${'a'.repeat(32)}'--`]) {
      expect(parseInviteToken(bad)).toBeNull()
    }
  })

  it('appends the token to the join link', () => {
    expect(withInviteToken('https://s.example.com/join-school', 'ab'.repeat(32))).toBe(
      `https://s.example.com/join-school?invite=${'ab'.repeat(32)}`
    )
  })
})
