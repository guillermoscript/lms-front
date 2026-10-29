import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = { setting_value?: unknown }
const state = {
  settingValue: undefined as unknown,
  monthly: 0,
  ipHour: 0,
  deviceHour: 0,
  official: 0,
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const filters: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q,
        eq: (col: string) => (filters.push(col), q),
        not: () => (filters.push('not_guest'), q),
        gte: () => q,
        maybeSingle: async () => ({
          data: state.settingValue === undefined ? null : ({ setting_value: state.settingValue } as Row),
        }),
        then: (res: (v: unknown) => void) => {
          let count = 0
          if (filters.includes('not_guest')) count = state.monthly
          else if (filters.includes('ip_hash')) count = state.ipHour
          else if (filters.includes('is_official')) count = state.official
          else if (filters.includes('guest_token_hash')) count = state.deviceHour
          res({ count, error: null })
        },
      }
      return table === 'tenant_settings' || table === 'challenge_attempts' ? q : q
    },
  }),
}))

import {
  checkChallengeLimits,
  DEFAULT_GUEST_MONTHLY_CAP,
  GUEST_HOURLY_CAP,
  BURST_PER_MINUTE,
  hashIp,
  monthStart,
} from '@/lib/challenges/limits'

let n = 0
const input = () => ({
  tenantId: 't1',
  exerciseId: 1,
  ipHash: `ip-${n++}`,
  guestTokenHash: 'g1',
})

beforeEach(() => {
  Object.assign(state, { settingValue: undefined, monthly: 0, ipHour: 0, deviceHour: 0, official: 0 })
})

describe('checkChallengeLimits', () => {
  it('ok when under every cap', async () => {
    expect(await checkChallengeLimits(input())).toEqual({ status: 'ok' })
  })

  it('hourly IP cap boundary', async () => {
    state.ipHour = GUEST_HOURLY_CAP - 1
    expect((await checkChallengeLimits(input())).status).toBe('ok')
    state.ipHour = GUEST_HOURLY_CAP
    expect((await checkChallengeLimits(input())).status).toBe('rate_limited')
  })

  it('hourly device cap boundary', async () => {
    state.deviceHour = GUEST_HOURLY_CAP - 1
    expect((await checkChallengeLimits(input())).status).toBe('ok')
    state.deviceHour = GUEST_HOURLY_CAP
    expect((await checkChallengeLimits(input())).status).toBe('rate_limited')
  })

  it('one official attempt per guest per exercise', async () => {
    state.official = 0
    expect((await checkChallengeLimits(input())).status).toBe('ok')
    state.official = 1
    expect((await checkChallengeLimits(input())).status).toBe('rate_limited')
  })

  it('skips device and official checks without a guest token', async () => {
    state.deviceHour = 99
    state.official = 99
    expect((await checkChallengeLimits({ ...input(), guestTokenHash: null })).status).toBe('ok')
  })

  it('monthly cap boundary uses tenant setting', async () => {
    state.settingValue = 10
    state.monthly = 9
    expect((await checkChallengeLimits(input())).status).toBe('ok')
    state.monthly = 10
    expect((await checkChallengeLimits(input())).status).toBe('paused')
  })

  it('monthly cap falls back to default when missing or invalid', async () => {
    state.monthly = DEFAULT_GUEST_MONTHLY_CAP - 1
    expect((await checkChallengeLimits(input())).status).toBe('ok')
    state.monthly = DEFAULT_GUEST_MONTHLY_CAP
    expect((await checkChallengeLimits(input())).status).toBe('paused')
    state.settingValue = 'garbage'
    expect((await checkChallengeLimits(input())).status).toBe('paused')
  })

  it('cap of 0 pauses immediately; numeric strings are accepted', async () => {
    state.settingValue = 0
    expect((await checkChallengeLimits(input())).status).toBe('paused')
    state.settingValue = '5'
    state.monthly = 5
    expect((await checkChallengeLimits(input())).status).toBe('paused')
  })

  it('paused wins over hourly limit', async () => {
    state.settingValue = 1
    state.monthly = 1
    state.ipHour = 99
    expect((await checkChallengeLimits(input())).status).toBe('paused')
  })

  it('in-memory burst limiter trips after BURST_PER_MINUTE calls', async () => {
    const i = input()
    for (let k = 0; k < BURST_PER_MINUTE; k++) {
      expect((await checkChallengeLimits(i)).status).toBe('ok')
    }
    expect((await checkChallengeLimits(i)).status).toBe('rate_limited')
  })
})

describe('hashIp', () => {
  it('is deterministic, hex, and does not contain the raw IP', () => {
    process.env.CHALLENGE_IP_HASH_SECRET = 'secret-a'
    const h = hashIp('203.0.113.9')
    expect(h).toBe(hashIp('203.0.113.9'))
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('203')
    process.env.CHALLENGE_IP_HASH_SECRET = 'secret-b'
    expect(hashIp('203.0.113.9')).not.toBe(h)
  })
})

describe('monthStart', () => {
  it('is the first instant of the UTC month', () => {
    expect(monthStart(new Date('2026-10-29T15:00:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })
})
