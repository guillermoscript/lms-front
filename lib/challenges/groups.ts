import { nanoid } from 'nanoid'
import {
  GROUP_GUEST_MONTHLY_CAP,
  GROUP_NAME_MAX,
  MAX_GROUP_CHALLENGES_PER_MONTH,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_CREATED_PER_MONTH,
  MAX_GROUPS_CREATED_TOTAL,
} from './group-constants'
import type { createAdminClient } from '@/lib/supabase/admin'
import { createLinkCore, loadChallengesEnabled, type ChallengeActor, type ChallengeLinkDeps } from './links'
import { isGroupsEnabled } from './settings'
import { formatDisplayName } from './ranking'
import { monthStart } from './limits'
import {
  buildChallengeTable,
  buildGroupLeaderboard,
  type ChallengeTableRow,
  type GroupLeaderboardRow,
  type GroupParticipant,
} from './group-leaderboard'

/**
 * Friend groups for challenges (epic #1049, Phase 1 #1050).
 *
 * `challenge_groups`, `challenge_group_members` and `challenge_group_challenges`
 * are server-only (no RLS policies, like `challenge_attempts`), so everything
 * runs on the admin client with an explicit `tenant_id` filter and the actor's
 * membership checked here. A group never stores attempts: the leaderboard is
 * derived from the OFFICIAL `challenge_attempts` of the members on the group's
 * exercises, plus unclaimed guests who played through the group's links.
 * Nothing here grants course access or entitlements.
 *
 * No `next/*` imports: callers (server actions, pages) revalidate.
 */

type Admin = ReturnType<typeof createAdminClient>

export {
  GROUP_GUEST_MONTHLY_CAP,
  GROUP_NAME_MAX,
  MAX_GROUP_CHALLENGES_PER_MONTH,
  MAX_GROUP_MEMBERS,
  MAX_GROUPS_CREATED_PER_MONTH,
  MAX_GROUPS_CREATED_TOTAL,
}
/** Phase 1: free-text exercises only (multiple choice and speaking come in #1051/#1052). */
export const GROUP_CHALLENGE_TYPES: readonly string[] = ['essay', 'discussion']

export type GroupErrorCode =
  | 'invalid_input'
  | 'disabled'
  | 'plan'
  | 'banned'
  | 'not_member'
  | 'not_found'
  | 'forbidden'
  | 'cap_members'
  | 'cap_challenges'
  | 'cap_groups'
  | 'already_launched'
  | 'ineligible_exercise'
  | 'owner_cannot_leave'
  | 'failed'

export type GroupResult<T> = { ok: true; data: T } | { ok: false; code: GroupErrorCode }
const fail = (code: GroupErrorCode): { ok: false; code: GroupErrorCode } => ({ ok: false, code })

export type GroupActor = ChallengeActor

export async function loadGroupsEnabled(admin: Admin, tenantId: string): Promise<boolean> {
  if (!(await loadChallengesEnabled(admin, tenantId))) return false
  const { data } = await admin
    .from('tenant_settings')
    .select('setting_value')
    .eq('tenant_id', tenantId)
    .eq('setting_key', 'challenges_groups_enabled')
    .maybeSingle()
  return isGroupsEnabled(data?.setting_value)
}

export async function schoolMemberStatus(admin: Admin, tenantId: string, userId: string): Promise<'active' | 'banned' | null> {
  const { data } = await admin
    .from('tenant_users')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  if (data?.status === 'active') return 'active'
  if (data?.status === 'banned') return 'banned'
  return null
}

/** Active school member, else the matching refusal. */
async function requireSchoolMember(admin: Admin, tenantId: string, userId: string): Promise<GroupErrorCode | null> {
  const status = await schoolMemberStatus(admin, tenantId, userId)
  if (status === 'banned') return 'banned'
  return status === 'active' ? null : 'not_member'
}

type GroupRow = { id: string; tenant_id: string; name: string; created_by: string | null; invite_token: string; active: boolean; created_at: string }

async function loadGroup(admin: Admin, tenantId: string, groupId: string): Promise<GroupRow | null> {
  const { data } = await admin
    .from('challenge_groups')
    .select('id, tenant_id, name, created_by, invite_token, active, created_at')
    .eq('id', groupId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return data && data.active ? (data as GroupRow) : null
}

async function isGroupMember(admin: Admin, tenantId: string, groupId: string, userId: string): Promise<{ role: string } | null> {
  const { data } = await admin
    .from('challenge_group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle()
  return data ?? null
}

export const validGroupName = (name: unknown): name is string =>
  typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= GROUP_NAME_MAX

// ---------------------------------------------------------------------------
// Create

export async function createGroupCore(
  deps: ChallengeLinkDeps,
  actor: GroupActor,
  input: { name: string },
): Promise<GroupResult<{ id: string; inviteToken: string }>> {
  const { admin } = deps
  if (!validGroupName(input.name)) return fail('invalid_input')
  if (!(await loadGroupsEnabled(admin, actor.tenantId))) return fail('disabled')
  if (!(await deps.hasAiGrading(actor.tenantId))) return fail('plan')
  const refusal = await requireSchoolMember(admin, actor.tenantId, actor.userId)
  if (refusal) return fail(refusal)

  const { count: total } = await admin
    .from('challenge_groups')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', actor.tenantId)
    .eq('created_by', actor.userId)
    .eq('active', true)
  if ((total ?? 0) >= MAX_GROUPS_CREATED_TOTAL) return fail('cap_groups')
  const { count: monthly } = await admin
    .from('challenge_groups')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', actor.tenantId)
    .eq('created_by', actor.userId)
    .gte('created_at', monthStart().toISOString())
  if ((monthly ?? 0) >= MAX_GROUPS_CREATED_PER_MONTH) return fail('cap_groups')

  let group: { id: string; invite_token: string } | null = null
  for (let i = 0; i < 3 && !group; i++) {
    const { data, error } = await admin
      .from('challenge_groups')
      .insert({ tenant_id: actor.tenantId, name: input.name.trim(), created_by: actor.userId, invite_token: nanoid(16) })
      .select('id, invite_token')
      .single()
    if (data) group = data
    else if (error?.code !== '23505') return fail('failed')
  }
  if (!group) return fail('failed')

  const { error } = await admin
    .from('challenge_group_members')
    .insert({ group_id: group.id, user_id: actor.userId, tenant_id: actor.tenantId, role: 'owner' })
  if (error) {
    await admin.from('challenge_groups').delete().eq('id', group.id).eq('tenant_id', actor.tenantId)
    return fail('failed')
  }
  return { ok: true, data: { id: group.id, inviteToken: group.invite_token } }
}

// ---------------------------------------------------------------------------
// Join

export interface JoinData {
  groupId: string
  /** False when the person was already a member (idempotent repeat). */
  joined: boolean
}

async function joinGroupRow(admin: Admin, group: GroupRow, userId: string): Promise<GroupResult<JoinData>> {
  const tenantId = group.tenant_id
  if (!(await loadGroupsEnabled(admin, tenantId))) return fail('disabled')
  const refusal = await requireSchoolMember(admin, tenantId, userId)
  if (refusal) return fail(refusal)

  if (await isGroupMember(admin, tenantId, group.id, userId)) {
    return { ok: true, data: { groupId: group.id, joined: false } }
  }
  const { count } = await admin
    .from('challenge_group_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('group_id', group.id)
    .eq('tenant_id', tenantId)
  if ((count ?? 0) >= MAX_GROUP_MEMBERS) return fail('cap_members')

  const { error } = await admin
    .from('challenge_group_members')
    .insert({ group_id: group.id, user_id: userId, tenant_id: tenantId, role: 'member' })
  // A concurrent double tap hit the primary key: the person is in.
  if (error && error.code !== '23505') return fail('failed')
  return { ok: true, data: { groupId: group.id, joined: !error } }
}

/** One-tap join with the invite token. Idempotent. */
export async function joinGroupCore(
  admin: Admin,
  actor: { tenantId: string; userId: string },
  token: string,
): Promise<GroupResult<JoinData>> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(token)) return fail('not_found')
  const { data } = await admin
    .from('challenge_groups')
    .select('id, tenant_id, name, created_by, invite_token, active, created_at')
    .eq('invite_token', token)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!data || !data.active) return fail('not_found')
  return joinGroupRow(admin, data as GroupRow, actor.userId)
}

/**
 * After a guest claims an attempt played on a group challenge link, make them a
 * member of that group (the claim already proved they are an active school
 * member). Best-effort and idempotent: `[]` when the link belongs to no group.
 */
export async function joinGroupsOfLink(
  admin: Admin,
  actor: { tenantId: string; userId: string },
  linkToken: string,
): Promise<string[]> {
  const { data: link } = await admin
    .from('challenge_links')
    .select('id, tenant_id')
    .eq('token', linkToken)
    .eq('tenant_id', actor.tenantId)
    .maybeSingle()
  if (!link) return []
  const { data: rows } = await admin
    .from('challenge_group_challenges')
    .select('group_id')
    .eq('link_id', link.id)
    .eq('tenant_id', actor.tenantId)
  const joined: string[] = []
  for (const { group_id } of rows ?? []) {
    const group = await loadGroup(admin, actor.tenantId, group_id)
    if (!group) continue
    const r = await joinGroupRow(admin, group, actor.userId)
    if (r.ok) joined.push(group.id)
  }
  return joined
}

export async function leaveGroupCore(
  admin: Admin,
  actor: { tenantId: string; userId: string },
  groupId: string,
): Promise<GroupResult<{ groupId: string }>> {
  const group = await loadGroup(admin, actor.tenantId, groupId)
  if (!group) return fail('not_found')
  const member = await isGroupMember(admin, actor.tenantId, groupId, actor.userId)
  if (!member) return fail('not_member')
  if (member.role === 'owner') return fail('owner_cannot_leave')
  const { error } = await admin
    .from('challenge_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('tenant_id', actor.tenantId)
    .eq('user_id', actor.userId)
  return error ? fail('failed') : { ok: true, data: { groupId } }
}

// ---------------------------------------------------------------------------
// Launch a challenge into a group

export interface LaunchInput {
  groupId: string
  exerciseId: number
  /** Whether the person may use the exercise's course (entitlement or staff). */
  canUseCourse: (courseId: number) => Promise<boolean>
}

/**
 * Pick an essay/discussion exercise and launch it into the group. The link is
 * created by the shared `createLinkCore`, so the same gates apply (challenges on,
 * plan gate `ai_grading`, exercise `is_challengeable`). Any group member may
 * launch, capped per group per month; one launch per exercise per group.
 */
export async function launchGroupChallengeCore(
  deps: ChallengeLinkDeps,
  actor: GroupActor,
  input: LaunchInput,
): Promise<GroupResult<{ challengeId: string; token: string }>> {
  const { admin } = deps
  const { tenantId, userId } = actor
  if (typeof input.groupId !== 'string' || !Number.isInteger(input.exerciseId)) return fail('invalid_input')
  if (!(await loadGroupsEnabled(admin, tenantId))) return fail('disabled')
  if (!(await deps.hasAiGrading(tenantId))) return fail('plan')
  const refusal = await requireSchoolMember(admin, tenantId, userId)
  if (refusal) return fail(refusal)

  const group = await loadGroup(admin, tenantId, input.groupId)
  if (!group) return fail('not_found')
  if (!(await isGroupMember(admin, tenantId, group.id, userId))) return fail('not_member')

  const { data: exercise } = await admin
    .from('exercises')
    .select('id, course_id, exercise_type, is_challengeable, status')
    .eq('id', input.exerciseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (
    !exercise ||
    exercise.course_id == null ||
    exercise.is_challengeable !== true ||
    exercise.status !== 'published' ||
    !GROUP_CHALLENGE_TYPES.includes(exercise.exercise_type as string)
  ) {
    return fail('ineligible_exercise')
  }
  if (!(await input.canUseCourse(exercise.course_id))) return fail('ineligible_exercise')

  const { data: dup } = await admin
    .from('challenge_group_challenges')
    .select('id')
    .eq('group_id', group.id)
    .eq('tenant_id', tenantId)
    .eq('exercise_id', exercise.id)
    .maybeSingle()
  if (dup) return fail('already_launched')

  const { count } = await admin
    .from('challenge_group_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('group_id', group.id)
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart().toISOString())
  if ((count ?? 0) >= MAX_GROUP_CHALLENGES_PER_MONTH) return fail('cap_challenges')

  const link = await createLinkCore(deps, actor, { exerciseId: exercise.id, forPlay: true })
  if (!link.ok) return fail('failed')

  const { data: row, error } = await admin
    .from('challenge_group_challenges')
    .insert({ group_id: group.id, tenant_id: tenantId, exercise_id: exercise.id, link_id: link.data.id, created_by: userId })
    .select('id')
    .single()
  if (error) return fail(error.code === '23505' ? 'already_launched' : 'failed')
  return { ok: true, data: { challengeId: row.id, token: link.data.token } }
}

/**
 * True when the group(s) behind this link have spent the monthly guest-grading
 * cap. Called before a GUEST attempt on a group link is graded; a link outside
 * any group is never capped here (the tenant-wide cap in limits.ts still applies).
 */
export async function groupGuestCapReached(admin: Admin, input: { tenantId: string; linkId: string }): Promise<boolean> {
  const { data: gcs } = await admin
    .from('challenge_group_challenges')
    .select('group_id')
    .eq('link_id', input.linkId)
    .eq('tenant_id', input.tenantId)
  const groupIds = [...new Set((gcs ?? []).map((g) => g.group_id as string))]
  for (const groupId of groupIds) {
    const { data: links } = await admin
      .from('challenge_group_challenges')
      .select('link_id')
      .eq('group_id', groupId)
      .eq('tenant_id', input.tenantId)
    const linkIds = (links ?? []).map((l) => l.link_id as string)
    const { count, error } = await admin
      .from('challenge_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', input.tenantId)
      .in('link_id', linkIds)
      .not('guest_token_hash', 'is', null)
      .is('user_id', null)
      .gte('created_at', monthStart().toISOString())
    // Fail closed, like the other caps.
    if (error || (count ?? 0) >= GROUP_GUEST_MONTHLY_CAP) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Reads

export interface GroupSummary {
  id: string
  name: string
  memberCount: number
  isOwner: boolean
}

/** Groups the person belongs to in this school (empty when groups are off). */
export async function listMyGroups(admin: Admin, tenantId: string, userId: string): Promise<GroupSummary[]> {
  if (!(await loadGroupsEnabled(admin, tenantId))) return []
  const { data: mine } = await admin
    .from('challenge_group_members')
    .select('group_id, role')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
  if (!mine?.length) return []
  const ids = mine.map((m) => m.group_id as string)
  const [{ data: groups }, { data: members }] = await Promise.all([
    admin.from('challenge_groups').select('id, name, created_at').eq('tenant_id', tenantId).eq('active', true).in('id', ids),
    admin.from('challenge_group_members').select('group_id').eq('tenant_id', tenantId).in('group_id', ids),
  ])
  const counts = new Map<string, number>()
  for (const m of members ?? []) counts.set(m.group_id as string, (counts.get(m.group_id as string) ?? 0) + 1)
  const role = new Map(mine.map((m) => [m.group_id as string, m.role as string]))
  return (groups ?? [])
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((g) => ({ id: g.id, name: g.name, memberCount: counts.get(g.id) ?? 0, isOwner: role.get(g.id) === 'owner' }))
}

async function loadNames(admin: Admin, userIds: string[]): Promise<Map<string, string>> {
  if (!userIds.length) return new Map()
  const { data } = await admin.from('profiles').select('id, full_name').in('id', userIds)
  return new Map((data ?? []).map((p) => [p.id as string, formatDisplayName(p.full_name)]))
}

async function activeMemberIds(admin: Admin, tenantId: string, groupId: string): Promise<{ ids: string[]; roles: Map<string, string> }> {
  const { data: rows } = await admin
    .from('challenge_group_members')
    .select('user_id, role, joined_at')
    .eq('group_id', groupId)
    .eq('tenant_id', tenantId)
    .order('joined_at', { ascending: true })
  const candidates = (rows ?? []).map((r) => r.user_id as string)
  if (!candidates.length) return { ids: [], roles: new Map() }
  // Only ACTIVE school members are listed or ranked (never a banned or removed user).
  const { data: active } = await admin
    .from('tenant_users')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .in('user_id', candidates)
  const ok = new Set((active ?? []).map((a) => a.user_id as string))
  return { ids: candidates.filter((id) => ok.has(id)), roles: new Map((rows ?? []).map((r) => [r.user_id as string, r.role as string])) }
}

export interface GroupInvitePreview {
  groupId: string
  name: string
  /** First name + initial only. */
  members: string[]
  memberCount: number
  challenges: { title: string; linkToken: string }[]
}

/**
 * What a guest sees at `/grupo/<token>`: group name, member names (first name +
 * initial) and the open challenges to play. Null when the token is unknown,
 * the group is closed, belongs to another school or groups are off.
 */
export async function loadGroupInvite(admin: Admin, tenantId: string, token: string): Promise<GroupInvitePreview | null> {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{6,128}$/.test(token)) return null
  const { data: group } = await admin
    .from('challenge_groups')
    .select('id, tenant_id, name, active')
    .eq('invite_token', token)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!group || !group.active) return null
  if (!(await loadGroupsEnabled(admin, tenantId))) return null

  const { ids } = await activeMemberIds(admin, tenantId, group.id)
  const names = await loadNames(admin, ids.slice(0, MAX_GROUP_MEMBERS))
  const { data: gcs } = await admin
    .from('challenge_group_challenges')
    .select('exercise_id, link_id, created_at')
    .eq('group_id', group.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  const linkIds = (gcs ?? []).map((g) => g.link_id as string)
  const exIds = (gcs ?? []).map((g) => g.exercise_id as number)
  const [{ data: links }, { data: exercises }] = await Promise.all([
    linkIds.length
      ? admin.from('challenge_links').select('id, token, active').eq('tenant_id', tenantId).in('id', linkIds)
      : Promise.resolve({ data: [] as { id: string; token: string; active: boolean }[] }),
    exIds.length
      ? admin.from('exercises').select('id, title').eq('tenant_id', tenantId).in('id', exIds)
      : Promise.resolve({ data: [] as { id: number; title: string }[] }),
  ])
  const linkById = new Map((links ?? []).map((l) => [l.id, l]))
  const title = new Map((exercises ?? []).map((e) => [e.id, e.title]))
  return {
    groupId: group.id,
    name: group.name,
    members: ids.map((id) => names.get(id) ?? ''),
    memberCount: ids.length,
    challenges: (gcs ?? []).flatMap((g) => {
      const l = linkById.get(g.link_id as string)
      return l?.active ? [{ title: title.get(g.exercise_id as number) ?? '', linkToken: l.token }] : []
    }),
  }
}

export interface GroupChallengeView extends ChallengeTableRow {
  id: string
  title: string
  linkToken: string
  createdAt: string
  /** The viewer's OWN AI feedback and improvement tips; never anyone else's answer or feedback. */
  myFeedback: { text: string; improvements: string[] } | null
}

export interface GroupView {
  group: { id: string; name: string; inviteToken: string; isOwner: boolean; createdAt: string }
  memberCount: number
  leaderboard: GroupLeaderboardRow[]
  challenges: GroupChallengeView[]
  caps: { members: number; challengesPerMonth: number; launchedThisMonth: number }
}

type FeedbackJson = { feedback?: unknown; improvements?: unknown; criteria?: unknown }

const asCriteria = (raw: unknown): { id: string; met: boolean }[] =>
  Array.isArray(raw)
    ? raw.flatMap((c) =>
        c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string'
          ? [{ id: (c as { id: string }).id, met: (c as { met?: unknown }).met === true }]
          : [],
      )
    : []

/**
 * The group page, for a MEMBER only (`null` otherwise, including other
 * schools' groups). Exposes names as first name + initial, scores and the
 * viewer's own feedback — never another person's answer.
 */
export async function loadGroupView(admin: Admin, tenantId: string, userId: string, groupId: string): Promise<GroupView | null> {
  if (!(await loadGroupsEnabled(admin, tenantId))) return null
  const group = await loadGroup(admin, tenantId, groupId)
  if (!group) return null
  const me = await isGroupMember(admin, tenantId, groupId, userId)
  if (!me) return null
  if ((await schoolMemberStatus(admin, tenantId, userId)) !== 'active') return null

  const { ids: memberIds } = await activeMemberIds(admin, tenantId, groupId)
  const [names, { data: gcs }] = await Promise.all([
    loadNames(admin, memberIds),
    admin
      .from('challenge_group_challenges')
      .select('id, exercise_id, link_id, created_at')
      .eq('group_id', groupId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
  ])
  const challengeRows = gcs ?? []
  const exerciseIds = challengeRows.map((c) => c.exercise_id as number)
  const linkIds = challengeRows.map((c) => c.link_id as string)

  const [{ data: exercises }, { data: links }, memberAttempts, guestAttempts] = await Promise.all([
    exerciseIds.length ? admin.from('exercises').select('id, title').eq('tenant_id', tenantId).in('id', exerciseIds) : Promise.resolve({ data: [] as { id: number; title: string }[] }),
    linkIds.length ? admin.from('challenge_links').select('id, token').eq('tenant_id', tenantId).in('id', linkIds) : Promise.resolve({ data: [] as { id: string; token: string }[] }),
    exerciseIds.length && memberIds.length
      ? admin
          .from('challenge_attempts')
          .select('id, user_id, exercise_id, score, feedback, guest_token_hash, created_at')
          .eq('tenant_id', tenantId)
          .eq('is_official', true)
          .in('exercise_id', exerciseIds)
          .in('user_id', memberIds)
      : Promise.resolve({ data: [] }),
    linkIds.length
      ? admin
          .from('challenge_attempts')
          .select('id, user_id, exercise_id, score, feedback, guest_token_hash, created_at')
          .eq('tenant_id', tenantId)
          .eq('is_official', true)
          .in('link_id', linkIds)
          .is('user_id', null)
          .not('guest_token_hash', 'is', null)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  // Guests are numbered by the order they first played; their hash never leaves the server.
  const guestIndex = new Map<string, number>()
  const guestKey = (hash: string) => {
    if (!guestIndex.has(hash)) guestIndex.set(hash, guestIndex.size + 1)
    return `guest:${guestIndex.get(hash)}`
  }
  type A = { id: string; user_id: string | null; exercise_id: number; score: number; feedback: FeedbackJson | null; guest_token_hash: string | null }
  const attempts = [
    ...((memberAttempts.data ?? []) as A[]).map((a) => ({ ...a, key: a.user_id as string })),
    ...((guestAttempts.data ?? []) as A[]).map((a) => ({ ...a, key: guestKey(a.guest_token_hash as string) })),
  ]

  const participants: GroupParticipant[] = [
    ...memberIds.map((id) => ({ key: id, label: names.get(id) ?? '', isMe: id === userId })),
    ...[...guestIndex.values()].map((n) => ({ key: `guest:${n}`, label: null as string | null })),
  ]
  const leaderboard = buildGroupLeaderboard(
    participants,
    attempts.map((a) => ({ participantKey: a.key, exerciseId: a.exercise_id, score: a.score })),
    exerciseIds,
  )
  const tableAttempts = attempts.map((a) => ({
    participantKey: a.key,
    exerciseId: a.exercise_id,
    score: a.score,
    criteria: asCriteria(a.feedback?.criteria),
  }))
  const title = new Map((exercises ?? []).map((e) => [e.id, e.title]))
  const token = new Map((links ?? []).map((l) => [l.id, l.token]))

  const challenges = challengeRows.map((c) => {
    const table = buildChallengeTable(participants, tableAttempts, c.exercise_id as number)
    const mine = attempts.find((a) => a.key === userId && a.exercise_id === c.exercise_id)
    const improvements = Array.isArray(mine?.feedback?.improvements)
      ? (mine!.feedback!.improvements as unknown[]).filter((s): s is string => typeof s === 'string')
      : []
    const text = typeof mine?.feedback?.feedback === 'string' ? mine.feedback.feedback : ''
    return {
      ...table,
      id: c.id as string,
      title: title.get(c.exercise_id as number) ?? '',
      linkToken: token.get(c.link_id as string) ?? '',
      createdAt: c.created_at as string,
      myFeedback: mine ? { text, improvements } : null,
    }
  })
  const since = monthStart().toISOString()
  return {
    group: { id: group.id, name: group.name, inviteToken: group.invite_token, isOwner: me.role === 'owner', createdAt: group.created_at },
    memberCount: memberIds.length,
    leaderboard,
    challenges,
    caps: {
      members: MAX_GROUP_MEMBERS,
      challengesPerMonth: MAX_GROUP_CHALLENGES_PER_MONTH,
      launchedThisMonth: challengeRows.filter((c) => (c.created_at as string) >= since).length,
    },
  }
}

/**
 * Exercises a member can launch: published, challengeable essay/discussion
 * exercises of courses they can use, minus the ones the group already runs.
 */
export async function listLaunchableExercises(
  admin: Admin,
  tenantId: string,
  groupId: string,
  courseIds: number[],
): Promise<{ id: number; title: string; courseTitle: string }[]> {
  if (!courseIds.length) return []
  const [{ data: exercises }, { data: taken }, { data: courses }] = await Promise.all([
    admin
      .from('exercises')
      .select('id, title, course_id')
      .eq('tenant_id', tenantId)
      .eq('status', 'published')
      .eq('is_challengeable', true)
      .in('exercise_type', [...GROUP_CHALLENGE_TYPES])
      .in('course_id', courseIds)
      .order('title', { ascending: true }),
    admin.from('challenge_group_challenges').select('exercise_id').eq('group_id', groupId).eq('tenant_id', tenantId),
    admin.from('courses').select('course_id, title').eq('tenant_id', tenantId).in('course_id', courseIds),
  ])
  const used = new Set((taken ?? []).map((t) => t.exercise_id as number))
  const courseTitle = new Map((courses ?? []).map((c) => [c.course_id as number, c.title as string]))
  return (exercises ?? [])
    .filter((e) => !used.has(e.id))
    .map((e) => ({ id: e.id, title: e.title, courseTitle: courseTitle.get(e.course_id as number) ?? '' }))
}
