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

const TENANT = 'tenant-a'
const TOKEN = 'abcdef123456'

function seed(over: Partial<Record<string, Row>> = {}) {
  db.challenge_links = { id: 'l1', token: TOKEN, tenant_id: TENANT, exercise_id: 1, owner_attempt_id: 'a1', active: true }
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
