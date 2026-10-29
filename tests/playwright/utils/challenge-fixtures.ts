/**
 * Fixtures for the exercise-challenge specs (epic #1025, #1033).
 *
 * Everything lives in ONE throwaway school (own tenant, own slug) so the specs
 * never touch the seeded default / code-academy schools or the challenge rows
 * other work seeded there. Rows are created with the service-role client and
 * removed by `destroyChallengeFixtures`.
 *
 * The guest cookie is minted here with the SAME recipe as `lib/challenges/identity.ts`
 * (`<random>.<hmac-sha256(secret, "cookie:" + random)>`, stored hash =
 * `hmac(secret, "guest:" + token)`). That module is `server-only`, so a Node
 * spec cannot import it; `challenge-claim.test.ts` pins the cross-module
 * round trip on the unit side and the specs here prove it end to end: the app
 * server must accept this cookie and find the attempts stored under this hash.
 * It needs the same `CHALLENGE_HASH_SECRET` the app server runs with.
 */
import { createHmac, randomBytes } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  addMember,
  createQaTenant,
  destroyQaTenant,
  insertCourse,
  SEEDED,
  type QaTenant,
} from './plan-gate-fixtures'

export const GUEST_COOKIE = 'reto_guest'

export function challengeSecret(): string {
  const secret = process.env.CHALLENGE_HASH_SECRET
  if (!secret) throw new Error('CHALLENGE_HASH_SECRET is not set (the app server and the spec must share it)')
  return secret
}

const hmac = (purpose: string, value: string) =>
  createHmac('sha256', challengeSecret()).update(`${purpose}:${value}`).digest('hex')

/** A guest device token the app server will accept, and the hash stored for it. */
export function mintGuest(): { token: string; hash: string } {
  const random = randomBytes(32).toString('base64url')
  const token = `${random}.${hmac('cookie', random)}`
  return { token, hash: hmac('guest', token) }
}

export function cookieFor(host: string, token: string) {
  return { name: GUEST_COOKIE, value: token, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' as const }
}

export interface ChallengeWorld {
  tenant: QaTenant
  freeCourseId: number
  paidCourseId: number
  /** Free course: claim target, and the "next exercise" it unlocks. */
  freeEx: number
  freeNextEx: number
  /** Free course: play / duel / ranking target (ranking users A and B are official on it). */
  playEx: number
  /** Paid course exercise. */
  paidEx: number
  /** Used for the cap specs so they never collide with official-attempt unique indexes. */
  capEx: number
  users: { a: RankedUser; b: RankedUser }
  links: { open: string; scored: string; paid: string; capLink: string; toDeactivate: string; studentOwned: string; claimFree: string }
}

export interface RankedUser {
  id: string
  email: string
  fullName: string
  /** Expected public label: first name + last initial. */
  label: string
  score: number
}

async function createExercise(
  admin: SupabaseClient,
  tenantId: string,
  courseId: number,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const { data, error } = await admin
    .from('exercises')
    .insert({
      tenant_id: tenantId,
      course_id: courseId,
      title,
      instructions: `Instructions for ${title}`,
      exercise_type: 'essay',
      difficulty_level: 'easy',
      status: 'published',
      is_challengeable: true,
      exercise_config: { passing_score: 70 },
      created_by: SEEDED.owner.id,
      ...extra,
    })
    .select('id')
    .single()
  if (error) throw new Error(`could not insert exercise "${title}": ${error.message}`)
  return data.id as number
}

async function createUser(admin: SupabaseClient, email: string, fullName: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'password123',
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`)
  // The profile row comes from the signup trigger; make the name explicit.
  const { error: pErr } = await admin.from('profiles').update({ full_name: fullName }).eq('id', data.user.id)
  if (pErr) throw new Error(`could not name ${email}: ${pErr.message}`)
  return data.user.id
}

async function insertAttempt(admin: SupabaseClient, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await admin
    .from('challenge_attempts')
    .insert({
      ip_hash: 'e2e-ip',
      answer: { text: 'seeded answer' },
      is_official: true,
      passed: true,
      ...row,
    })
    .select('id')
    .single()
  if (error) throw new Error(`could not insert attempt: ${error.message}`)
  return data.id as string
}

async function insertLink(admin: SupabaseClient, row: Record<string, unknown>): Promise<void> {
  const { error } = await admin.from('challenge_links').insert(row)
  if (error) throw new Error(`could not insert link: ${error.message}`)
}

export async function createChallengeWorld(admin: SupabaseClient, tenant: QaTenant, run: number): Promise<ChallengeWorld> {
  await destroyChallengeFixtures(admin, tenant)
  // 'enterprise' carries the ai_grading feature the attempt API requires.
  await createQaTenant(admin, tenant, 'enterprise')
  await addMember(admin, tenant.id, SEEDED.owner.id, 'admin')
  await addMember(admin, tenant.id, SEEDED.student.id, 'student')
  const { error: sErr } = await admin
    .from('tenant_settings')
    .upsert({ tenant_id: tenant.id, setting_key: 'challenges_enabled', setting_value: { enabled: true } }, { onConflict: 'tenant_id,setting_key' })
  if (sErr) throw new Error(`could not enable challenges: ${sErr.message}`)

  const freeCourseId = await insertCourse(admin, tenant.id, `E2E challenges free ${run}`)
  const paidCourseId = await insertCourse(admin, tenant.id, `E2E challenges paid ${run}`)
  const { data: product, error: pErr } = await admin
    .from('products')
    .insert({ tenant_id: tenant.id, name: `E2E challenges product ${run}`, price: 25, currency: 'usd', status: 'active' })
    .select('product_id')
    .single()
  if (pErr) throw new Error(`could not insert product: ${pErr.message}`)
  const { error: pcErr } = await admin
    .from('product_courses')
    .insert({ tenant_id: tenant.id, product_id: product.product_id, course_id: paidCourseId })
  if (pcErr) throw new Error(`could not link product: ${pcErr.message}`)

  const freeEx = await createExercise(admin, tenant.id, freeCourseId, `Claim target ${run}`)
  const freeNextEx = await createExercise(admin, tenant.id, freeCourseId, `Next exercise ${run}`, { is_challengeable: false })
  const playEx = await createExercise(admin, tenant.id, freeCourseId, `Play target ${run}`)
  const capEx = await createExercise(admin, tenant.id, freeCourseId, `Cap target ${run}`)
  const paidEx = await createExercise(admin, tenant.id, paidCourseId, `Paid target ${run}`)

  const users = {
    a: { fullName: 'Ana Maria Lopez', label: 'Ana L.', score: 87 },
    b: { fullName: 'Bruno Quintero', label: 'Bruno Q.', score: 64 },
  }
  const a: RankedUser = { ...users.a, email: `e2e-chlg-a-${run}@e2etest.invalid`, id: '' }
  const b: RankedUser = { ...users.b, email: `e2e-chlg-b-${run}@e2etest.invalid`, id: '' }
  a.id = await createUser(admin, a.email, a.fullName)
  b.id = await createUser(admin, b.email, b.fullName)

  const attemptA = await insertAttempt(admin, { tenant_id: tenant.id, exercise_id: playEx, user_id: a.id, score: a.score })
  await insertAttempt(admin, { tenant_id: tenant.id, exercise_id: playEx, user_id: b.id, score: b.score, passed: false })
  const paidAttemptA = await insertAttempt(admin, { tenant_id: tenant.id, exercise_id: paidEx, user_id: a.id, score: 90 })
  const studentAttempt = await insertAttempt(admin, { tenant_id: tenant.id, exercise_id: capEx, user_id: SEEDED.student.id, score: 77 })

  const tok = (name: string) => `e2e-${name}-${run}`
  const links = {
    open: tok('open'),
    scored: tok('scored'),
    paid: tok('paid'),
    capLink: tok('cap'),
    toDeactivate: tok('deact'),
    studentOwned: tok('student'),
    claimFree: tok('claimfree'),
  }
  // `open`: no owner attempt, so no score to beat. The rest carry a challenger.
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: playEx, token: links.open, created_by: a.id })
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: playEx, token: links.scored, created_by: a.id, owner_attempt_id: attemptA })
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: paidEx, token: links.paid, created_by: a.id, owner_attempt_id: paidAttemptA })
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: freeEx, token: links.toDeactivate, created_by: a.id })
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: capEx, token: links.capLink, created_by: a.id })
  await insertLink(admin, {
    tenant_id: tenant.id, exercise_id: capEx, token: links.studentOwned, created_by: SEEDED.student.id, owner_attempt_id: studentAttempt,
  })
  // The claim target needs its own live link (`toDeactivate` is switched off by a test).
  await insertLink(admin, { tenant_id: tenant.id, exercise_id: freeEx, token: links.claimFree, created_by: a.id })

  return { tenant, freeCourseId, paidCourseId, freeEx, freeNextEx, playEx, paidEx, capEx, users: { a, b }, links }
}

/** Seed a claimable guest attempt (as `/api/reto/attempt` would have stored it). */
export async function seedGuestAttempt(
  admin: SupabaseClient,
  tenantId: string,
  exerciseId: number,
  guestHash: string,
  score: number,
  extra: Record<string, unknown> = {},
) {
  return insertAttempt(admin, { tenant_id: tenantId, exercise_id: exerciseId, guest_token_hash: guestHash, score, passed: score >= 70, ...extra })
}

/** `userIds`: the ranking users this run created (`world.users`); omit on the pre-clean. */
export async function destroyChallengeFixtures(admin: SupabaseClient, tenant: QaTenant, userIds: string[] = []) {
  await admin.from('challenge_attempts').delete().eq('tenant_id', tenant.id)
  await admin.from('challenge_links').delete().eq('tenant_id', tenant.id)
  await admin.from('exercises').delete().eq('tenant_id', tenant.id)
  await admin.from('product_courses').delete().eq('tenant_id', tenant.id)
  await admin.from('products').delete().eq('tenant_id', tenant.id)
  await destroyQaTenant(admin, tenant)
  for (const id of userIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) throw new Error(`could not delete user ${id}: ${error.message}`)
  }
}
