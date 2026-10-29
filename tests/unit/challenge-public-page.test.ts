import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> | null
const db: Record<string, Row> = {}

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.maybeSingle = async () => ({ data: db[table] ?? null })
      return chain
    },
  }),
}))

import { displayName, loadChallengePage } from '@/lib/challenges/public-page'
import { challengeHeadline } from '@/lib/challenges/headline'

const TENANT = 'tenant-a'
const TOKEN = 'abcdef123456'

function seed(over: Partial<Record<string, Row>> = {}) {
  db.challenge_links = { id: 'l1', token: TOKEN, tenant_id: TENANT, exercise_id: 1, owner_attempt_id: 'a1', active: true, created_by: 'u1' }
  db.tenant_settings = { setting_value: { enabled: true } }
  db.exercises = { id: 1, title: 'T', instructions: 'I', exercise_type: 'essay', exercise_config: { passing_score: 80 }, is_challengeable: true, status: 'published' }
  db.challenge_attempts = { score: 87, passed: true, user_id: 'u1' }
  db.profiles = { full_name: 'Guillermo Marin' }
  Object.assign(db, over)
}

describe('displayName', () => {
  it('first name + last initial', () => {
    expect(displayName('Guillermo Marin')).toBe('Guillermo M.')
    expect(displayName('  ana maría  de la cruz ')).toBe('ana C.')
  })
  it('single name stays as is', () => expect(displayName('Guille')).toBe('Guille'))
  it('empty or missing is null so the page renders the guest label', () => {
    expect(displayName(null)).toBeNull()
    expect(displayName('   ')).toBeNull()
  })
})

describe('loadChallengePage gating', () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k]
    seed()
  })

  it('loads a valid link with the challenger display name', async () => {
    const d = await loadChallengePage(TOKEN, TENANT)
    expect(d?.challenger).toMatchObject({ score: 87, name: 'Guillermo M.' })
    expect(d?.exercise.passingScore).toBe(80)
  })
  // Also the reader behind the OG route (`loadPublicChallenge` is this function).
  it.each([
    [true, true], ['true', true], [{ enabled: true }, true], [{ enabled: false }, false], [false, false],
  ])('challenges_enabled shape %j => loads: %s', async (raw, loads) => {
    seed({ tenant_settings: { setting_value: raw } })
    expect(Boolean(await loadChallengePage(TOKEN, TENANT))).toBe(loads)
  })
  it('404s on tenant mismatch', async () => expect(await loadChallengePage(TOKEN, 'tenant-b')).toBeNull())
  it('404s on inactive link', async () => {
    seed({ challenge_links: { ...db.challenge_links!, active: false } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
  })
  it('404s when challenges are off or unset', async () => {
    seed({ tenant_settings: { setting_value: { enabled: false } } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
    seed({ tenant_settings: null })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
  })
  it('404s on unpublished or non-challengeable exercise', async () => {
    seed({ exercises: { ...db.exercises!, status: 'draft' } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
    seed({ exercises: { ...db.exercises!, is_challengeable: false } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
  })
  it('404s on disallowed exercise types', async () => {
    for (const t of ['quiz', 'multiple_choice', 'true_false', 'fill_in_the_blank', 'coding_challenge']) {
      seed({ exercises: { ...db.exercises!, exercise_type: t } })
      expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
    }
  })
  it('rejects malformed tokens without querying', async () => expect(await loadChallengePage('a b', TENANT)).toBeNull())
})

describe('open link (no challenger score)', () => {
  beforeEach(() => {
    for (const k of Object.keys(db)) delete db[k]
    seed({
      challenge_links: { id: 'l2', token: TOKEN, tenant_id: TENANT, exercise_id: 1, owner_attempt_id: null, active: true, created_by: 'u1' },
      challenge_attempts: null,
    })
  })

  it('keeps the SAME gating as a scored link and carries the creator name, no score', async () => {
    const d = await loadChallengePage(TOKEN, TENANT)
    expect(d?.challenger).toBeNull()
    expect(d?.creatorName).toBe('Guillermo M.')
    expect(await loadChallengePage(TOKEN, 'tenant-b')).toBeNull()
    seed({ challenge_links: { ...db.challenge_links!, active: false } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
    seed({ challenge_links: { ...db.challenge_links!, active: true }, tenant_settings: { setting_value: { enabled: false } } })
    expect(await loadChallengePage(TOKEN, TENANT)).toBeNull()
  })

  it('headline for page, metadata and OG: invitation, never a score', async () => {
    const t = (key: string, v?: Record<string, string | number>) => `${key}|${JSON.stringify(v)}`
    const open = (await loadChallengePage(TOKEN, TENANT))!
    expect(challengeHeadline(t, open)).toBe('openLine|{"name":"Guillermo M.","exercise":"T"}')
    expect(challengeHeadline(t, { ...open, creatorName: null })).toBe('openLineAnon|{"exercise":"T"}')
    const scored = { ...open, challenger: { score: 87, passed: true, name: null, userId: 'u1' } }
    expect(challengeHeadline(t, scored)).toBe('challengerLine|{"name":"guestName|undefined","score":87,"exercise":"T"}')
  })
})
