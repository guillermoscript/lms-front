import { beforeEach, describe, expect, it, vi } from 'vitest'

const createLinkMock = vi.fn()
vi.mock('@/lib/challenges/links', async (orig) => ({
  ...(await orig<typeof import('@/lib/challenges/links')>()),
  createLinkCore: (...args: unknown[]) => createLinkMock(...args),
}))

import {
  GROUP_GUEST_MONTHLY_CAP,
  MAX_GROUPS_CREATED_PER_MONTH,
  MAX_GROUPS_CREATED_TOTAL,
  MAX_GROUP_CHALLENGES_PER_MONTH,
  MAX_GROUP_MEMBERS,
  createGroupCore,
  groupGuestCapReached,
  joinGroupCore,
  joinGroupsOfLink,
  launchGroupChallengeCore,
  leaveGroupCore,
  listMyGroups,
  loadGroupInvite,
  loadGroupView,
} from '@/lib/challenges/groups'

const T = 'tenant-a'
const OTHER_T = 'tenant-b'
const ME = 'user-me'
const ANA = 'user-ana'
const BETO = 'user-beto'
const TOKEN = 'invite-token-1'
const NOW = new Date()
const iso = (d: Date) => d.toISOString()
const LAST_MONTH = '2000-01-01T00:00:00.000Z'

type Row = Record<string, unknown>
let tables: Record<string, Row[]>
let insertErrors: Record<string, { code: string }[]>
let seq: number
let inserts: { table: string; row: Row }[]
let deletes: string[]

function builder(table: string) {
  const f: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
  let payload: Row = {}
  let countMode = false
  const sort: [string, boolean][] = []
  const match = () =>
    (tables[table] ??= [])
      .filter((r) => f.every((p) => p(r)))
      .sort((a, b) => {
        for (const [c, asc] of sort) {
          const x = a[c] as string
          const y = b[c] as string
          const d = x < y ? -1 : x > y ? 1 : 0
          if (d) return asc ? d : -d
        }
        return 0
      })
  const doInsert = () => {
    const err = (insertErrors[table] ??= []).shift()
    if (err) return { data: null, error: err }
    const row: Row = { id: `${table}-${++seq}`, ...(table === 'challenge_groups' ? { active: true, created_at: iso(NOW) } : {}), ...payload }
    ;(tables[table] ??= []).push(row)
    inserts.push({ table, row })
    return { data: row, error: null }
  }
  const b: Record<string, unknown> = {
    select: (_c?: string, o?: { count?: string; head?: boolean }) => {
      if (o?.count) countMode = true
      return b
    },
    eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), b),
    is: (c: string, v: unknown) => (f.push((r) => (v === null ? r[c] == null : r[c] === v)), b),
    in: (c: string, vs: unknown[]) => (f.push((r) => vs.includes(r[c])), b),
    not: (c: string, _op: string, v: unknown) => (f.push((r) => (v === null ? r[c] != null : r[c] !== v)), b),
    gte: (c: string, v: string) => (f.push((r) => (r[c] as string) >= v), b),
    lte: (c: string, v: string) => (f.push((r) => (r[c] as string) <= v), b),
    order: (c: string, o?: { ascending?: boolean }) => (sort.push([c, o?.ascending !== false]), b),
    limit: () => b,
    insert: (p: Row) => ((op = 'insert'), (payload = p), b),
    update: (p: Row) => ((op = 'update'), (payload = p), b),
    delete: () => ((op = 'delete'), b),
    maybeSingle: async () => ({ data: match()[0] ?? null, error: null }),
    single: async () => {
      if (op === 'insert') {
        const r = doInsert()
        return r.error ? r : { data: r.data, error: null }
      }
      return { data: match()[0] ?? null, error: null }
    },
    then: (res: (v: unknown) => void) => {
      if (op === 'insert') return res(doInsert())
      if (op === 'update') {
        for (const r of match()) Object.assign(r, payload)
        return res({ data: null, error: null })
      }
      if (op === 'delete') {
        const gone = new Set(match())
        tables[table] = tables[table].filter((r) => !gone.has(r))
        deletes.push(table)
        return res({ data: null, error: null })
      }
      const rows = match()
      res(countMode ? { data: null, count: rows.length, error: null } : { data: rows, error: null })
    },
  }
  return b
}
const admin = { from: (t: string) => builder(t) } as never
let plan = true
const deps = () => ({ admin, hasAiGrading: async () => plan })
const actor = (tenantId = T, userId = ME) => ({ tenantId, userId, role: 'student' as const })
const who = (tenantId = T, userId = ME) => ({ tenantId, userId })
const canUse = async () => true

const group = (over: Row = {}): Row => ({
  id: 'g1', tenant_id: T, name: 'Los panas', created_by: ME, invite_token: TOKEN, active: true, created_at: LAST_MONTH, ...over,
})
const gm = (user_id: string, role = 'member', group_id = 'g1', tenant_id = T): Row => ({ group_id, user_id, tenant_id, role, joined_at: `2020-01-0${(seq++ % 9) + 1}` })
const tu = (user_id: string, status = 'active', tenant_id = T): Row => ({ user_id, tenant_id, status })

beforeEach(() => {
  plan = true
  seq = 0
  inserts = []
  deletes = []
  insertErrors = {}
  createLinkMock.mockReset()
  createLinkMock.mockResolvedValue({ ok: true, data: { id: 'link-new', token: 'tok-new' } })
  tables = {
    tenant_settings: [{ tenant_id: T, setting_key: 'challenges_enabled', setting_value: { enabled: true } }],
    tenant_users: [tu(ME), tu(ANA), tu(BETO)],
    challenge_groups: [group()],
    challenge_group_members: [gm(ME, 'owner'), gm(ANA)],
    challenge_group_challenges: [],
    challenge_links: [],
    challenge_attempts: [],
    exercises: [
      { id: 5, tenant_id: T, course_id: 9, exercise_type: 'essay', is_challengeable: true, status: 'published', title: 'Ensayo' },
      { id: 6, tenant_id: T, course_id: 9, exercise_type: 'quiz', is_challengeable: true, status: 'published', title: 'Quiz' },
      { id: 7, tenant_id: T, course_id: 9, exercise_type: 'discussion', is_challengeable: false, status: 'published', title: 'NoChal' },
      { id: 8, tenant_id: T, course_id: 9, exercise_type: 'discussion', is_challengeable: true, status: 'published', title: 'Debate' },
    ],
    profiles: [
      { id: ME, full_name: 'Maria Lopez' },
      { id: ANA, full_name: 'Ana Perez Ruiz' },
      { id: BETO, full_name: 'Beto' },
    ],
  }
})

const groupsOff = () =>
  tables.tenant_settings.push({ tenant_id: T, setting_key: 'challenges_groups_enabled', setting_value: { enabled: false } })
const challengesOff = () => (tables.tenant_settings = [])

describe('createGroupCore', () => {
  it('active member creates a group and becomes owner', async () => {
    const r = await createGroupCore(deps(), actor(), { name: '  Nuevos  ' })
    expect(r.ok).toBe(true)
    const g = inserts.find((i) => i.table === 'challenge_groups')!.row
    expect(g).toMatchObject({ tenant_id: T, name: 'Nuevos', created_by: ME })
    expect(String(g.invite_token)).toHaveLength(16)
    expect(inserts.find((i) => i.table === 'challenge_group_members')!.row).toMatchObject({ user_id: ME, role: 'owner', tenant_id: T })
    if (r.ok) expect(r.data.inviteToken).toBe(g.invite_token)
  })
  it('rejects invalid names', async () => {
    for (const name of ['', '   ', 'x'.repeat(61)]) {
      expect(await createGroupCore(deps(), actor(), { name })).toEqual({ ok: false, code: 'invalid_input' })
    }
    expect(inserts).toHaveLength(0)
  })
  it('refuses non-member, banned, groups off, challenges off, plan', async () => {
    expect(await createGroupCore(deps(), actor(T, 'stranger'), { name: 'x' })).toEqual({ ok: false, code: 'not_member' })
    tables.tenant_users.push(tu('banned-guy', 'banned'))
    expect(await createGroupCore(deps(), actor(T, 'banned-guy'), { name: 'x' })).toEqual({ ok: false, code: 'banned' })
    plan = false
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'plan' })
    plan = true
    groupsOff()
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'disabled' })
    tables.tenant_settings.pop()
    challengesOff()
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'disabled' })
    expect(inserts).toHaveLength(0)
  })
  it('a user of another tenant is not a member here', async () => {
    tables.tenant_users = [tu(ME, 'active', OTHER_T)]
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'not_member' })
  })
  it('caps the total of active groups created', async () => {
    tables.challenge_groups = Array.from({ length: MAX_GROUPS_CREATED_TOTAL }, (_, i) => group({ id: `gx${i}` }))
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'cap_groups' })
  })
  it('caps groups created this month', async () => {
    tables.challenge_groups = Array.from({ length: MAX_GROUPS_CREATED_PER_MONTH }, (_, i) => group({ id: `gx${i}`, created_at: iso(NOW) }))
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'cap_groups' })
  })
  it('retries a token collision (23505), fails on other errors', async () => {
    insertErrors.challenge_groups = [{ code: '23505' }]
    expect((await createGroupCore(deps(), actor(), { name: 'x' })).ok).toBe(true)
    insertErrors.challenge_groups = [{ code: '23505' }, { code: '23505' }, { code: '23505' }]
    expect(await createGroupCore(deps(), actor(), { name: 'y' })).toEqual({ ok: false, code: 'failed' })
    insertErrors.challenge_groups = [{ code: '42501' }]
    expect(await createGroupCore(deps(), actor(), { name: 'z' })).toEqual({ ok: false, code: 'failed' })
  })
  it('rolls the group back when the owner membership cannot be inserted', async () => {
    insertErrors.challenge_group_members = [{ code: 'XX000' }]
    const before = tables.challenge_groups.length
    expect(await createGroupCore(deps(), actor(), { name: 'x' })).toEqual({ ok: false, code: 'failed' })
    expect(tables.challenge_groups).toHaveLength(before)
  })
})

describe('joinGroupCore', () => {
  it('active school member joins with the token', async () => {
    const r = await joinGroupCore(admin, who(T, BETO), TOKEN)
    expect(r).toEqual({ ok: true, data: { groupId: 'g1', joined: true } })
    expect(inserts[0].row).toMatchObject({ group_id: 'g1', user_id: BETO, tenant_id: T, role: 'member' })
  })
  it('is idempotent: second join is ok, joined:false, no second insert', async () => {
    await joinGroupCore(admin, who(T, BETO), TOKEN)
    const again = await joinGroupCore(admin, who(T, BETO), TOKEN)
    expect(again).toEqual({ ok: true, data: { groupId: 'g1', joined: false } })
    expect(inserts).toHaveLength(1)
    // already in from the start
    expect(await joinGroupCore(admin, who(T, ANA), TOKEN)).toMatchObject({ ok: true, data: { joined: false } })
  })
  it('a concurrent double tap (23505) is still ok', async () => {
    insertErrors.challenge_group_members = [{ code: '23505' }]
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: true, data: { groupId: 'g1', joined: false } })
    insertErrors.challenge_group_members = [{ code: 'XX000' }]
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'failed' })
  })
  it('non-member and banned users are refused', async () => {
    expect(await joinGroupCore(admin, who(T, 'stranger'), TOKEN)).toEqual({ ok: false, code: 'not_member' })
    tables.tenant_users.push(tu('bad', 'banned'))
    expect(await joinGroupCore(admin, who(T, 'bad'), TOKEN)).toEqual({ ok: false, code: 'banned' })
    expect(inserts).toHaveLength(0)
  })
  it('a token from another tenant is not_found; bad shapes too', async () => {
    tables.challenge_groups = [group({ tenant_id: OTHER_T })]
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'not_found' })
    for (const bad of ['', 'abc', 'has space!!', 'x'.repeat(129)]) {
      expect(await joinGroupCore(admin, who(T, BETO), bad)).toEqual({ ok: false, code: 'not_found' })
    }
  })
  it('inactive group is not_found', async () => {
    tables.challenge_groups[0].active = false
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'not_found' })
  })
  it('groups off / challenges off -> disabled', async () => {
    groupsOff()
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'disabled' })
    tables.tenant_settings.pop()
    challengesOff()
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'disabled' })
  })
  it('member cap', async () => {
    tables.challenge_group_members = Array.from({ length: MAX_GROUP_MEMBERS }, (_, i) => gm(`u${i}`))
    expect(await joinGroupCore(admin, who(T, BETO), TOKEN)).toEqual({ ok: false, code: 'cap_members' })
    expect(inserts).toHaveLength(0)
  })
})

describe('joinGroupsOfLink', () => {
  beforeEach(() => {
    tables.challenge_links = [{ id: 'l1', token: 'link-token-1', tenant_id: T }]
    tables.challenge_group_challenges = [{ id: 'c1', group_id: 'g1', link_id: 'l1', tenant_id: T, exercise_id: 5, created_at: iso(NOW) }]
  })
  it('joins the group behind the link, idempotently', async () => {
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'link-token-1')).toEqual(['g1'])
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'link-token-1')).toEqual(['g1'])
    expect(inserts).toHaveLength(1)
  })
  it('[] for unknown link, other tenant link, link outside any group', async () => {
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'nope')).toEqual([])
    expect(await joinGroupsOfLink(admin, who(OTHER_T, BETO), 'link-token-1')).toEqual([])
    tables.challenge_group_challenges = []
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'link-token-1')).toEqual([])
  })
  it('skips closed groups and refused joins (banned, groups off)', async () => {
    tables.challenge_groups[0].active = false
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'link-token-1')).toEqual([])
    tables.challenge_groups[0].active = true
    tables.tenant_users.push(tu('bad', 'banned'))
    expect(await joinGroupsOfLink(admin, who(T, 'bad'), 'link-token-1')).toEqual([])
    groupsOff()
    expect(await joinGroupsOfLink(admin, who(T, BETO), 'link-token-1')).toEqual([])
    expect(inserts).toHaveLength(0)
  })
})

describe('leaveGroupCore', () => {
  it('a member leaves', async () => {
    expect(await leaveGroupCore(admin, who(T, ANA), 'g1')).toEqual({ ok: true, data: { groupId: 'g1' } })
    expect(tables.challenge_group_members.some((m) => m.user_id === ANA)).toBe(false)
    expect(tables.challenge_group_members.some((m) => m.user_id === ME)).toBe(true)
  })
  it('owner cannot leave; non-member refused; other tenant / unknown -> not_found', async () => {
    expect(await leaveGroupCore(admin, who(T, ME), 'g1')).toEqual({ ok: false, code: 'owner_cannot_leave' })
    expect(await leaveGroupCore(admin, who(T, BETO), 'g1')).toEqual({ ok: false, code: 'not_member' })
    expect(await leaveGroupCore(admin, who(OTHER_T, ANA), 'g1')).toEqual({ ok: false, code: 'not_found' })
    expect(await leaveGroupCore(admin, who(T, ANA), 'nope')).toEqual({ ok: false, code: 'not_found' })
    expect(deletes).toHaveLength(0)
  })
})

describe('launchGroupChallengeCore', () => {
  const input = (exerciseId = 5, groupId = 'g1') => ({ groupId, exerciseId, canUseCourse: canUse })

  it('a member launches an essay: link created for play, row inserted', async () => {
    const r = await launchGroupChallengeCore(deps(), actor(), input())
    expect(r).toMatchObject({ ok: true, data: { token: 'tok-new' } })
    expect(createLinkMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: ME }), { exerciseId: 5, forPlay: true })
    expect(inserts.find((i) => i.table === 'challenge_group_challenges')!.row).toMatchObject({
      group_id: 'g1', tenant_id: T, exercise_id: 5, link_id: 'link-new', created_by: ME,
    })
  })
  it('discussion exercises are eligible', async () => {
    expect((await launchGroupChallengeCore(deps(), actor(), input(8))).ok).toBe(true)
  })
  it('non-essay/discussion, not challengeable, missing, unpublished, or unusable course -> ineligible_exercise', async () => {
    for (const id of [6, 7, 999]) {
      expect(await launchGroupChallengeCore(deps(), actor(), input(id))).toEqual({ ok: false, code: 'ineligible_exercise' })
    }
    tables.exercises[0].status = 'draft'
    expect(await launchGroupChallengeCore(deps(), actor(), input(5))).toEqual({ ok: false, code: 'ineligible_exercise' })
    tables.exercises[0].status = 'published'
    const r = await launchGroupChallengeCore(deps(), actor(), { groupId: 'g1', exerciseId: 5, canUseCourse: async () => false })
    expect(r).toEqual({ ok: false, code: 'ineligible_exercise' })
    expect(createLinkMock).not.toHaveBeenCalled()
  })
  it('exercise of another tenant is ineligible', async () => {
    tables.exercises[0].tenant_id = OTHER_T
    expect(await launchGroupChallengeCore(deps(), actor(), input(5))).toEqual({ ok: false, code: 'ineligible_exercise' })
  })
  it('duplicate launch -> already_launched', async () => {
    await launchGroupChallengeCore(deps(), actor(), input())
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'already_launched' })
    expect(createLinkMock).toHaveBeenCalledTimes(1)
  })
  it('unique violation on insert -> already_launched', async () => {
    insertErrors.challenge_group_challenges = [{ code: '23505' }]
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'already_launched' })
  })
  it('monthly cap per group', async () => {
    tables.challenge_group_challenges = Array.from({ length: MAX_GROUP_CHALLENGES_PER_MONTH }, (_, i) => ({
      id: `c${i}`, group_id: 'g1', tenant_id: T, exercise_id: 100 + i, link_id: `l${i}`, created_at: iso(NOW),
    }))
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'cap_challenges' })
    // older launches do not count
    tables.challenge_group_challenges.forEach((c) => (c.created_at = LAST_MONTH))
    expect((await launchGroupChallengeCore(deps(), actor(), input())).ok).toBe(true)
  })
  it('link creation failure -> failed, nothing inserted', async () => {
    createLinkMock.mockResolvedValue({ ok: false, error: 'nope' })
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'failed' })
    expect(inserts).toHaveLength(0)
  })
  it('plan, disabled, banned, non-school-member, non group member, other tenant', async () => {
    plan = false
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'plan' })
    plan = true
    groupsOff()
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'disabled' })
    tables.tenant_settings.pop()
    tables.tenant_users.push(tu('bad', 'banned'))
    expect(await launchGroupChallengeCore(deps(), actor(T, 'bad'), input())).toEqual({ ok: false, code: 'banned' })
    expect(await launchGroupChallengeCore(deps(), actor(T, 'stranger'), input())).toEqual({ ok: false, code: 'not_member' })
    // active school member, not in the group
    expect(await launchGroupChallengeCore(deps(), actor(T, BETO), input())).toEqual({ ok: false, code: 'not_member' })
    // group of tenant B looked up with tenant A
    tables.challenge_groups[0].tenant_id = OTHER_T
    expect(await launchGroupChallengeCore(deps(), actor(), input())).toEqual({ ok: false, code: 'not_found' })
    expect(createLinkMock).not.toHaveBeenCalled()
  })
  it('invalid input', async () => {
    expect(await launchGroupChallengeCore(deps(), actor(), { groupId: 'g1', exerciseId: 1.5, canUseCourse: canUse })).toEqual({ ok: false, code: 'invalid_input' })
    expect(await launchGroupChallengeCore(deps(), actor(), { groupId: 3 as never, exerciseId: 5, canUseCourse: canUse })).toEqual({ ok: false, code: 'invalid_input' })
  })
})

describe('groupGuestCapReached', () => {
  const guestAttempt = (i: number, over: Row = {}): Row => ({
    id: `ga${i}`, tenant_id: T, link_id: 'l1', user_id: null, guest_token_hash: `h${i}`, created_at: iso(NOW), ...over,
  })
  beforeEach(() => {
    tables.challenge_group_challenges = [
      { id: 'c1', group_id: 'g1', link_id: 'l1', tenant_id: T, exercise_id: 5 },
      { id: 'c2', group_id: 'g1', link_id: 'l2', tenant_id: T, exercise_id: 8 },
    ]
  })
  it('below the cap -> false; at the cap (summed across the group links) -> true', async () => {
    tables.challenge_attempts = Array.from({ length: GROUP_GUEST_MONTHLY_CAP - 1 }, (_, i) => guestAttempt(i, { link_id: i % 2 ? 'l1' : 'l2' }))
    expect(await groupGuestCapReached(admin, { tenantId: T, linkId: 'l1' })).toBe(false)
    tables.challenge_attempts.push(guestAttempt(99, { link_id: 'l2' }))
    expect(await groupGuestCapReached(admin, { tenantId: T, linkId: 'l1' })).toBe(true)
  })
  it('does not count member attempts, last month attempts, or other links', async () => {
    tables.challenge_attempts = Array.from({ length: GROUP_GUEST_MONTHLY_CAP }, (_, i) =>
      i % 3 === 0 ? guestAttempt(i, { user_id: ME, guest_token_hash: null }) : i % 3 === 1 ? guestAttempt(i, { created_at: LAST_MONTH }) : guestAttempt(i, { link_id: 'other' }),
    )
    expect(await groupGuestCapReached(admin, { tenantId: T, linkId: 'l1' })).toBe(false)
  })
  it('a link outside any group is never capped here', async () => {
    tables.challenge_attempts = Array.from({ length: GROUP_GUEST_MONTHLY_CAP + 5 }, (_, i) => guestAttempt(i, { link_id: 'solo' }))
    expect(await groupGuestCapReached(admin, { tenantId: T, linkId: 'solo' })).toBe(false)
  })
  it('another tenant sees no group for the link', async () => {
    tables.challenge_attempts = Array.from({ length: GROUP_GUEST_MONTHLY_CAP }, (_, i) => guestAttempt(i))
    expect(await groupGuestCapReached(admin, { tenantId: OTHER_T, linkId: 'l1' })).toBe(false)
  })
})

describe('loadGroupInvite', () => {
  beforeEach(() => {
    tables.challenge_links = [
      { id: 'l1', token: 'link-open', tenant_id: T, active: true },
      { id: 'l2', token: 'link-closed', tenant_id: T, active: false },
    ]
    tables.challenge_group_challenges = [
      { id: 'c1', group_id: 'g1', link_id: 'l1', tenant_id: T, exercise_id: 5, created_at: '2025-01-02' },
      { id: 'c2', group_id: 'g1', link_id: 'l2', tenant_id: T, exercise_id: 8, created_at: '2025-01-01' },
    ]
  })
  it('shows name, first-name+initial members and only open challenges', async () => {
    const p = await loadGroupInvite(admin, T, TOKEN)
    expect(p).toMatchObject({ groupId: 'g1', name: 'Los panas', memberCount: 2 })
    expect(p!.members.sort()).toEqual(['Ana R.', 'Maria L.'])
    expect(p!.challenges).toEqual([{ title: 'Ensayo', linkToken: 'link-open' }])
    expect(JSON.stringify(p)).not.toContain('Perez')
  })
  it('hides banned members', async () => {
    tables.tenant_users.find((u) => u.user_id === ANA)!.status = 'banned'
    const p = await loadGroupInvite(admin, T, TOKEN)
    expect(p!.memberCount).toBe(1)
    expect(p!.members).toEqual(['Maria L.'])
  })
  it('null for other tenant, inactive, groups off, challenges off, bad tokens', async () => {
    expect(await loadGroupInvite(admin, OTHER_T, TOKEN)).toBeNull()
    expect(await loadGroupInvite(admin, T, 'bad token')).toBeNull()
    expect(await loadGroupInvite(admin, T, 'unknown-token')).toBeNull()
    groupsOff()
    expect(await loadGroupInvite(admin, T, TOKEN)).toBeNull()
    tables.tenant_settings.pop()
    challengesOff()
    expect(await loadGroupInvite(admin, T, TOKEN)).toBeNull()
    tables.tenant_settings = [{ tenant_id: T, setting_key: 'challenges_enabled', setting_value: { enabled: true } }]
    tables.challenge_groups[0].active = false
    expect(await loadGroupInvite(admin, T, TOKEN)).toBeNull()
  })
})

describe('loadGroupView', () => {
  const att = (over: Row): Row => ({
    id: `a${++seq}`, tenant_id: T, is_official: true, user_id: null, guest_token_hash: null, link_id: 'l1', created_at: iso(NOW), feedback: null, ...over,
  })
  beforeEach(() => {
    tables.challenge_links = [{ id: 'l1', token: 'link-open', tenant_id: T, active: true }]
    tables.challenge_group_challenges = [{ id: 'c1', group_id: 'g1', link_id: 'l1', tenant_id: T, exercise_id: 5, created_at: iso(NOW) }]
    tables.challenge_attempts = [
      att({
        user_id: ME, exercise_id: 5, score: 85,
        feedback: { feedback: 'MY OWN FEEDBACK', improvements: ['mine tip'], criteria: [{ id: 'c1', met: true, description: 'RUBRIC SECRET' }] },
      }),
      att({
        user_id: ANA, exercise_id: 5, score: 60,
        feedback: { feedback: 'ANA PRIVATE ANSWER', improvements: ['ana tip'], criteria: [{ id: 'c1', met: false }] },
        answer: 'ANA ANSWER TEXT',
      }),
      att({ guest_token_hash: 'SECRETHASH1', exercise_id: 5, score: 70, feedback: { feedback: 'GUEST FB', criteria: [{ id: 'c1', met: true }] } }),
      att({ user_id: ME, exercise_id: 5, score: 10, is_official: false }),
    ]
  })

  it('member sees leaderboard, challenge table, own feedback only; guest label null', async () => {
    const v = (await loadGroupView(admin, T, ME, 'g1'))!
    expect(v.group).toMatchObject({ id: 'g1', name: 'Los panas', inviteToken: TOKEN, isOwner: true })
    expect(v.memberCount).toBe(2)
    expect(v.caps).toMatchObject({ members: MAX_GROUP_MEMBERS, challengesPerMonth: MAX_GROUP_CHALLENGES_PER_MONTH, launchedThisMonth: 1 })
    expect(v.leaderboard.map((r) => [r.key, r.average, r.rank])).toEqual([[ME, 85, 1], ['guest:1', 70, 2], [ANA, 60, 3]])
    expect(v.leaderboard.find((r) => r.key === 'guest:1')!.label).toBeNull()
    expect(v.leaderboard.find((r) => r.key === ME)!.label).toBe('Maria L.')
    const ch = v.challenges[0]
    expect(ch).toMatchObject({ id: 'c1', title: 'Ensayo', linkToken: 'link-open', myScore: 85 })
    expect(ch.myFeedback).toEqual({ text: 'MY OWN FEEDBACK', improvements: ['mine tip'] })
    expect(ch.criteria[0].byParticipant.map((p) => p.met)).toEqual([true, true, false])
    expect(ch.pending).toEqual([]) // everybody active has played; guest not pending
  })

  it('never leaks hashes, others answers/feedback or rubric text', async () => {
    const json = JSON.stringify(await loadGroupView(admin, T, ME, 'g1'))
    for (const s of ['guest_token_hash', 'SECRETHASH1', 'ANA PRIVATE ANSWER', 'ANA ANSWER TEXT', 'GUEST FB', 'ana tip', 'RUBRIC SECRET', 'Perez', 'description']) {
      expect(json).not.toContain(s)
    }
  })

  it('a non-official attempt is ignored', async () => {
    const v = (await loadGroupView(admin, T, ME, 'g1'))!
    expect(v.leaderboard.find((r) => r.key === ME)!.average).toBe(85)
  })

  it('non-owner member view, myFeedback null when the viewer has not played', async () => {
    tables.challenge_attempts = tables.challenge_attempts.filter((a) => a.user_id !== ANA)
    const v = (await loadGroupView(admin, T, ANA, 'g1'))!
    expect(v.group.isOwner).toBe(false)
    expect(v.challenges[0].myFeedback).toBeNull()
    expect(v.challenges[0].criteria).toEqual([]) // viewer has not played
    expect(v.challenges[0].pending.map((p) => p.isMe)).toEqual([true])
  })

  it('null for non group member, non school member, banned, other tenant, inactive, disabled', async () => {
    expect(await loadGroupView(admin, T, BETO, 'g1')).toBeNull()
    expect(await loadGroupView(admin, OTHER_T, ME, 'g1')).toBeNull()
    expect(await loadGroupView(admin, T, ME, 'nope')).toBeNull()
    tables.tenant_users.find((u) => u.user_id === ME)!.status = 'banned'
    expect(await loadGroupView(admin, T, ME, 'g1')).toBeNull()
    tables.tenant_users = tables.tenant_users.filter((u) => u.user_id !== ME)
    expect(await loadGroupView(admin, T, ME, 'g1')).toBeNull()
    tables.tenant_users.push(tu(ME))
    groupsOff()
    expect(await loadGroupView(admin, T, ME, 'g1')).toBeNull()
    tables.tenant_settings.pop()
    tables.challenge_groups[0].active = false
    expect(await loadGroupView(admin, T, ME, 'g1')).toBeNull()
  })

  it('banned group members are not listed or ranked', async () => {
    tables.tenant_users.find((u) => u.user_id === ANA)!.status = 'banned'
    const v = (await loadGroupView(admin, T, ME, 'g1'))!
    expect(v.memberCount).toBe(1)
    expect(v.leaderboard.some((r) => r.key === ANA)).toBe(false)
  })
})

describe('listMyGroups', () => {
  it('lists my groups with member counts and ownership', async () => {
    tables.challenge_groups.push(group({ id: 'g2', name: 'Otro', created_by: ANA, invite_token: 'tok-g2-xxxx', created_at: '2021-01-01' }))
    tables.challenge_group_members.push(gm(ME, 'member', 'g2'), gm(ANA, 'owner', 'g2'), gm(BETO, 'member', 'g2'))
    const r = await listMyGroups(admin, T, ME)
    expect(r).toEqual([
      { id: 'g1', name: 'Los panas', memberCount: 2, isOwner: true },
      { id: 'g2', name: 'Otro', memberCount: 3, isOwner: false },
    ])
  })
  it('empty when not in any group, groups off, other tenant, or group inactive', async () => {
    expect(await listMyGroups(admin, T, BETO)).toEqual([])
    expect(await listMyGroups(admin, OTHER_T, ME)).toEqual([])
    tables.challenge_groups[0].active = false
    expect(await listMyGroups(admin, T, ME)).toEqual([])
    tables.challenge_groups[0].active = true
    groupsOff()
    expect(await listMyGroups(admin, T, ME)).toEqual([])
  })
})
