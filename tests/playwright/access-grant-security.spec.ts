/**
 * Access-grant security — "no course access without the proper flow".
 *
 * Course access lives in `entitlements`. It may only be created by:
 *   - the transactions trigger (a server-written 'successful' row),
 *   - grant_free_entitlement / self_enroll_subscription_course (they validate
 *     the caller), or
 *   - service-role code.
 * Migration 20261022131000_lock_access_grant_paths revoked the SECURITY DEFINER
 * grant functions (enroll_user, handle_new_subscription) from clients, dropped
 * the subscriptions INSERT policy and gated lessons_ai_* / exercise_files reads.
 * This spec attacks every one of those paths through role `authenticated` /
 * `anon` clients (PostgREST, exactly what a browser holds) and asserts the
 * attack FAILS, plus one positive control per area so a too-tight lock-down
 * (which would break real purchases) fails loudly as well.
 *
 * API-level only: no page, no app server is exercised.
 *
 * Fixtures are created with the service-role client under a unique marker and
 * removed in afterAll. Nothing here touches seeded rows.
 */
import { test, expect } from './utils/test'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS } from './utils/constants'

const TENANT_A = '00000000-0000-0000-0000-000000000001' // default
const TENANT_B = '00000000-0000-0000-0000-000000000002' // code-academy
const STUDENT_ID = 'a1000000-0000-0000-0000-000000000001' // student@e2etest.com, member of A only
const OWNER_ID = 'a1000000-0000-0000-0000-000000000002' // owner@e2etest.com, admin of A
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004' // alice@student.com, member of B only
const SEEDED_TENANT_B_COURSE = 2001 // Python for Beginners (Alice is entitled)

const RUN = Date.now()
const MARK = `[E2E] ags ${RUN}`

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!

function getAdmin() {
  return createSupabaseClient(url(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Role `authenticated` client with the tenant claims the JWT hook injects. */
async function signIn(account: { email: string; password: string }) {
  const client = createSupabaseClient(url(), anonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await client.auth.signInWithPassword(account)
  expect(error, `sign-in failed for ${account.email}`).toBeNull()
  return client
}

/** Role `anon` client carrying the tenant header `proxy.ts` injects. */
function getAnon(tenantId: string) {
  return createSupabaseClient(url(), anonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'x-tenant-id': tenantId } },
  })
}

type Fx = {
  paidCourse: number
  paidProduct: number
  lockedLesson: number
  previewLesson: number
  aiTask: number
  aiMessage: number
  exercise: number
  exerciseFile: number
  freeCourse: number
  freeProduct: number
  planOnlyCourse: number
  plan: number
  planPendingTx: number
  foreignCourse: number // tenant B
  foreignLesson: number
  createdTx: number[]
}
const fx = {} as Fx
fx.createdTx = []

const admin = getAdmin()
let student: SupabaseClient
let alice: SupabaseClient
let anonA: SupabaseClient
let anonB: SupabaseClient

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(`fixture ${what}: ${error.message}`)
  return data
}

async function entitlementsOf(userId: string, courseIds: number[]) {
  const { data, error } = await admin
    .from('entitlements')
    .select('entitlement_id, course_id, source_type, status, expires_at, revoked_at')
    .eq('user_id', userId)
    .in('course_id', courseIds)
  expect(error).toBeNull()
  return data ?? []
}

/** Denied = an error OR no row came back / was affected. */
function expectDenied(res: { data: unknown; error: unknown }, what: string) {
  const rows = Array.isArray(res.data) ? res.data.length : res.data ? 1 : 0
  expect(res.error !== null || rows === 0, `${what} was NOT denied (data=${JSON.stringify(res.data)})`).toBe(true)
}

test.describe.configure({ mode: 'serial' })

test.describe('Access-grant security', () => {
  test.beforeAll(async () => {
    // Other specs move these users' tenant claim (a stale one makes every
    // tenant-scoped read come back empty); pin it before signing in, as
    // lesson-resource-url.spec.ts does.
    for (const [id, tenant] of [
      [STUDENT_ID, TENANT_A],
      [ALICE_ID, TENANT_B],
    ] as const) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        app_metadata: { tenant_id: tenant },
        user_metadata: { preferred_tenant_id: tenant },
      })
      expect(error).toBeNull()
    }
    student = await signIn(ACCOUNTS.student)
    alice = await signIn(ACCOUNTS.tenantStudent)
    anonA = getAnon(TENANT_A)
    anonB = getAnon(TENANT_B)

    // --- paid course (tenant A) behind a paid product -----------------------
    const paidCourse = await must(
      admin.from('courses').insert({ title: `${MARK} paid`, status: 'published', tenant_id: TENANT_A }).select('course_id').single(),
      'paid course'
    )
    fx.paidCourse = paidCourse.course_id
    const paidProduct = await must(
      admin.from('products').insert({ name: `${MARK} paid product`, price: 29, status: 'active', tenant_id: TENANT_A }).select('product_id').single(),
      'paid product'
    )
    fx.paidProduct = paidProduct.product_id
    await must(
      admin.from('product_courses').insert({ product_id: fx.paidProduct, course_id: fx.paidCourse, tenant_id: TENANT_A }).select(),
      'product_courses'
    )
    const locked = await must(
      admin.from('lessons').insert({ course_id: fx.paidCourse, title: `${MARK} locked`, content: 'secret', sequence: 1, status: 'published', tenant_id: TENANT_A, is_preview: false }).select('id').single(),
      'locked lesson'
    )
    fx.lockedLesson = locked.id
    const prev = await must(
      admin.from('lessons').insert({ course_id: fx.paidCourse, title: `${MARK} preview`, content: 'teaser', sequence: 2, status: 'published', tenant_id: TENANT_A, is_preview: true }).select('id').single(),
      'preview lesson'
    )
    fx.previewLesson = prev.id
    const task = await must(
      admin.from('lessons_ai_tasks').insert({ lesson_id: fx.lockedLesson, system_prompt: `${MARK} SYSTEM PROMPT`, task_instructions: 'x' }).select('id').single(),
      'ai task'
    )
    fx.aiTask = task.id
    // A message written by ANOTHER user (Alice) on the locked lesson.
    const msg = await must(
      admin.from('lessons_ai_task_messages').insert({ lesson_id: fx.lockedLesson, user_id: ALICE_ID, sender: 'user', message: `${MARK} private chat` }).select('id').single(),
      'ai message'
    )
    fx.aiMessage = msg.id
    const ex = await must(
      admin.from('exercises').insert({ lesson_id: fx.lockedLesson, course_id: fx.paidCourse, tenant_id: TENANT_A, title: `${MARK} ex`, instructions: 'x', exercise_type: 'coding_challenge', difficulty_level: 'easy', status: 'published' }).select('id').single(),
      'exercise'
    )
    fx.exercise = ex.id
    const exf = await must(
      admin.from('exercise_files').insert({ exercise_id: fx.exercise, file_path: 'main.py', content: `${MARK} SOLUTION`, file_type: 'solution' }).select('id').single(),
      'exercise file'
    )
    fx.exerciseFile = exf.id

    // --- genuinely free course (price 0 product) ----------------------------
    const freeCourse = await must(
      admin.from('courses').insert({ title: `${MARK} free`, status: 'published', tenant_id: TENANT_A }).select('course_id').single(),
      'free course'
    )
    fx.freeCourse = freeCourse.course_id
    const freeProduct = await must(
      admin.from('products').insert({ name: `${MARK} free product`, price: 0, status: 'active', tenant_id: TENANT_A }).select('product_id').single(),
      'free product'
    )
    fx.freeProduct = freeProduct.product_id
    await must(
      admin.from('product_courses').insert({ product_id: fx.freeProduct, course_id: fx.freeCourse, tenant_id: TENANT_A }).select(),
      'free product_courses'
    )

    // --- plan-only course (reachable only through a subscription) ----------
    const planCourse = await must(
      admin.from('courses').insert({ title: `${MARK} plan-only`, status: 'published', tenant_id: TENANT_A }).select('course_id').single(),
      'plan course'
    )
    fx.planOnlyCourse = planCourse.course_id
    const plan = await must(
      admin.from('plans').insert({ plan_name: `${MARK} plan`, price: 10, duration_in_days: 30, tenant_id: TENANT_A }).select('plan_id').single(),
      'plan'
    )
    fx.plan = plan.plan_id
    await must(admin.from('plan_courses').insert({ plan_id: fx.plan, course_id: fx.planOnlyCourse }).select(), 'plan_courses')
    // A pending (never settled) transaction the attacker can point a forged subscription at.
    const ptx = await must(
      admin.from('transactions').insert({ user_id: STUDENT_ID, plan_id: fx.plan, amount: 10, status: 'pending', tenant_id: TENANT_A, payment_method: 'manual' }).select('transaction_id').single(),
      'pending plan tx'
    )
    fx.planPendingTx = ptx.transaction_id
    fx.createdTx.push(fx.planPendingTx)

    // --- tenant B content the tenant A student must never see --------------
    const fc = await must(
      admin.from('courses').insert({ title: `${MARK} foreign`, status: 'published', tenant_id: TENANT_B }).select('course_id').single(),
      'foreign course'
    )
    fx.foreignCourse = fc.course_id
    const fl = await must(
      admin.from('lessons').insert({ course_id: fx.foreignCourse, title: `${MARK} foreign lesson`, content: 'b-secret', sequence: 1, status: 'published', tenant_id: TENANT_B, is_preview: false }).select('id').single(),
      'foreign lesson'
    )
    fx.foreignLesson = fl.id
  })

  test.afterAll(async () => {
    // Children first. Every step is best-effort so one failure cannot strand the rest.
    const courses = [fx.paidCourse, fx.freeCourse, fx.planOnlyCourse, fx.foreignCourse].filter(Boolean)
    const products = [fx.paidProduct, fx.freeProduct].filter(Boolean)
    const step = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
      try {
        const { error } = await p
        if (error) console.warn(`[access-grant-security cleanup] ${label}: ${error.message}`)
      } catch (e) {
        console.warn(`[access-grant-security cleanup] ${label}:`, e)
      }
    }
    if (courses.length) {
      // Collect every transaction this run produced (incl. trigger-created ones) via its product/plan.
      const { data: txs } = await admin
        .from('transactions')
        .select('transaction_id')
        .or(
          [
            products.length ? `product_id.in.(${products.join(',')})` : null,
            fx.plan ? `plan_id.eq.${fx.plan}` : null,
          ]
            .filter(Boolean)
            .join(',')
        )
      const txIds = new Set<number>([...fx.createdTx, ...(txs ?? []).map((t) => t.transaction_id)])
      await step('subscriptions', admin.from('subscriptions').delete().eq('plan_id', fx.plan))
      await step('entitlements', admin.from('entitlements').delete().in('course_id', courses))
      await step('enrollments', admin.from('enrollments').delete().in('course_id', courses))
      if (txIds.size) await step('transactions', admin.from('transactions').delete().in('transaction_id', [...txIds]))
    }
    if (fx.exerciseFile) await step('exercise_files', admin.from('exercise_files').delete().eq('id', fx.exerciseFile))
    if (fx.exercise) await step('exercises', admin.from('exercises').delete().eq('id', fx.exercise))
    if (fx.aiMessage) await step('ai messages', admin.from('lessons_ai_task_messages').delete().eq('id', fx.aiMessage))
    if (fx.aiTask) await step('ai tasks', admin.from('lessons_ai_tasks').delete().eq('id', fx.aiTask))
    if (courses.length) await step('lessons', admin.from('lessons').delete().in('course_id', courses))
    if (fx.plan) {
      await step('plan_courses', admin.from('plan_courses').delete().eq('plan_id', fx.plan))
      await step('plans', admin.from('plans').delete().eq('plan_id', fx.plan))
    }
    if (products.length) {
      await step('product_courses', admin.from('product_courses').delete().in('product_id', products))
      await step('products', admin.from('products').delete().in('product_id', products))
    }
    if (courses.length) await step('courses', admin.from('courses').delete().in('course_id', courses))
  })

  // ---------------------------------------------------------------- 1
  test.describe('1. grant functions are not callable by clients', () => {
    test('student cannot enroll_user() themselves into a paid product', async () => {
      const res = await student.rpc('enroll_user', { _user_id: STUDENT_ID, _product_id: fx.paidProduct })
      expect(res.error, 'enroll_user must be rejected for role authenticated').not.toBeNull()
      expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)
    })

    test('student cannot handle_new_subscription() themselves onto a plan', async () => {
      const res = await student.rpc('handle_new_subscription', {
        _user_id: STUDENT_ID,
        _plan_id: fx.plan,
        _transaction_id: fx.planPendingTx,
      })
      expect(res.error, 'handle_new_subscription must be rejected for role authenticated').not.toBeNull()
      const { data } = await admin.from('subscriptions').select('subscription_id').eq('user_id', STUDENT_ID).eq('plan_id', fx.plan)
      expect(data ?? []).toHaveLength(0)
      expect(await entitlementsOf(STUDENT_ID, [fx.planOnlyCourse])).toHaveLength(0)
    })

    test('anon cannot enroll a victim user_id into a paid product', async () => {
      const res = await anonA.rpc('enroll_user', { _user_id: STUDENT_ID, _product_id: fx.paidProduct })
      expect(res.error, 'enroll_user must be rejected for role anon').not.toBeNull()
      expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)
    })

    test('anon cannot hand a victim a subscription', async () => {
      const res = await anonA.rpc('handle_new_subscription', {
        _user_id: STUDENT_ID,
        _plan_id: fx.plan,
        _transaction_id: fx.planPendingTx,
      })
      expect(res.error).not.toBeNull()
      const { data } = await admin.from('subscriptions').select('subscription_id').eq('user_id', STUDENT_ID).eq('plan_id', fx.plan)
      expect(data ?? []).toHaveLength(0)
    })
  })

  // ---------------------------------------------------------------- 2
  test('2. student cannot forge a subscription row, nor self-enroll a plan-only course', async () => {
    const forged = await student
      .from('subscriptions')
      .insert({
        user_id: STUDENT_ID,
        plan_id: fx.plan,
        subscription_status: 'active',
        start_date: new Date().toISOString(),
        end_date: '2099-01-01T00:00:00Z',
        transaction_id: fx.planPendingTx,
        tenant_id: TENANT_A,
        payment_provider: 'manual',
      })
      .select()
    expect(forged.error, 'subscriptions INSERT must be rejected by RLS').not.toBeNull()
    const { data: subs } = await admin.from('subscriptions').select('subscription_id').eq('user_id', STUDENT_ID).eq('plan_id', fx.plan)
    expect(subs ?? []).toHaveLength(0)

    const enroll = await student.rpc('self_enroll_subscription_course', { _course_id: fx.planOnlyCourse })
    expect(enroll.error, 'self_enroll without an active subscription must fail').not.toBeNull()
    expect(await entitlementsOf(STUDENT_ID, [fx.planOnlyCourse])).toHaveLength(0)
  })

  // ---------------------------------------------------------------- 3
  test('3. student cannot write entitlements (insert / revive / extend / delete)', async () => {
    for (const source of ['free', 'admin_grant', 'product'] as const) {
      const ins = await student
        .from('entitlements')
        .insert({
          user_id: STUDENT_ID,
          course_id: fx.paidCourse,
          tenant_id: TENANT_A,
          source_type: source,
          status: 'active',
        })
        .select()
      expectDenied(ins, `entitlements INSERT source=${source}`)
    }
    expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)

    // Seed a revoked row and a near-expiry row for the student, then try to tamper with them.
    const past = new Date(Date.now() - 86_400_000).toISOString()
    const soon = new Date(Date.now() + 3_600_000).toISOString()
    const { data: seeded, error: seedErr } = await admin
      .from('entitlements')
      .insert([
        { user_id: STUDENT_ID, course_id: fx.paidCourse, tenant_id: TENANT_A, source_type: 'admin_grant', status: 'revoked', revoked_at: past },
        { user_id: STUDENT_ID, course_id: fx.freeCourse, tenant_id: TENANT_A, source_type: 'admin_grant', status: 'active', expires_at: soon },
      ])
      .select('entitlement_id, course_id')
    expect(seedErr).toBeNull()
    const revokedId = seeded!.find((r) => r.course_id === fx.paidCourse)!.entitlement_id
    const expiringId = seeded!.find((r) => r.course_id === fx.freeCourse)!.entitlement_id

    expectDenied(
      await student.from('entitlements').update({ status: 'active', revoked_at: null }).eq('entitlement_id', revokedId).select(),
      'revive revoked entitlement'
    )
    expectDenied(
      await student.from('entitlements').update({ expires_at: '2099-01-01T00:00:00Z' }).eq('entitlement_id', expiringId).select(),
      'extend expires_at'
    )
    expectDenied(await student.from('entitlements').delete().eq('entitlement_id', expiringId).select(), 'delete entitlement')

    const after = await entitlementsOf(STUDENT_ID, [fx.paidCourse, fx.freeCourse])
    const revoked = after.find((r) => r.entitlement_id === revokedId)
    const expiring = after.find((r) => r.entitlement_id === expiringId)
    expect(revoked?.status).toBe('revoked')
    expect(revoked?.revoked_at).not.toBeNull()
    expect(expiring, 'entitlement row must still exist').toBeTruthy()
    expect(new Date(expiring!.expires_at!).getTime()).toBeLessThan(Date.now() + 2 * 3_600_000)

    // The (admin-seeded, revoked) row grants nothing: the locked lesson stays unreadable.
    const read = await student.from('lessons').select('id').eq('id', fx.lockedLesson)
    expect(read.data ?? []).toHaveLength(0)

    await admin.from('entitlements').delete().in('entitlement_id', [revokedId, expiringId])
  })

  // ---------------------------------------------------------------- 4
  test('4. student cannot mint or settle a transaction', async () => {
    const base = {
      user_id: STUDENT_ID,
      product_id: fx.paidProduct,
      amount: 29,
      tenant_id: TENANT_A,
      payment_method: 'manual',
    }
    const direct = await student.from('transactions').insert({ ...base, status: 'successful' }).select()
    expect(direct.error, "INSERT status='successful' must be rejected").not.toBeNull()

    const pending = await student.from('transactions').insert({ ...base, status: 'pending' }).select('transaction_id')
    if (pending.error) {
      // Allowed to be blocked outright (e.g. a fee gate); the attack is still closed.
      expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)
    } else {
      const txId = pending.data![0].transaction_id as number
      fx.createdTx.push(txId)
      const settle = await student.from('transactions').update({ status: 'successful' }).eq('transaction_id', txId).select()
      expectDenied(settle, "UPDATE pending -> 'successful'")
      const { data: row } = await admin.from('transactions').select('status').eq('transaction_id', txId).single()
      expect(row?.status).toBe('pending')
    }
    expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)
    const { data: leaked } = await admin.from('transactions').select('transaction_id').eq('user_id', STUDENT_ID).eq('product_id', fx.paidProduct).eq('status', 'successful')
    expect(leaked ?? []).toHaveLength(0)
  })

  // ---------------------------------------------------------------- 5
  test.describe('5. gated reads without an entitlement', () => {
    test('anon reads no lessons_ai_tasks / messages / exercise_files / locked lessons', async () => {
      for (const [table, id] of [
        ['lessons_ai_tasks', fx.aiTask],
        ['lessons_ai_task_messages', fx.aiMessage],
        ['exercise_files', fx.exerciseFile],
        ['lessons', fx.lockedLesson],
      ] as const) {
        const res = await anonA.from(table).select('id').eq('id', id)
        expectDenied(res, `anon select ${table}`)
      }
      // No wildcard leak either: nothing of ours in a blind select.
      const blind = await anonA.from('lessons_ai_tasks').select('id, system_prompt').ilike('system_prompt', `${MARK}%`)
      expectDenied(blind, 'anon blind lessons_ai_tasks')
    })

    test('student without entitlement reads none of them', async () => {
      for (const [table, id] of [
        ['lessons_ai_tasks', fx.aiTask],
        ['lessons_ai_task_messages', fx.aiMessage], // another user's chat
        ['exercise_files', fx.exerciseFile],
        ['lessons', fx.lockedLesson],
      ] as const) {
        const res = await student.from(table).select('id').eq('id', id)
        expect(res.error).toBeNull()
        expect(res.data ?? [], `student must not read ${table}#${id}`).toHaveLength(0)
      }
      const blind = await student.from('lessons_ai_tasks').select('id').ilike('system_prompt', `${MARK}%`)
      expect(blind.data ?? []).toHaveLength(0)
    })

    test('the legacy lessons.ai_task_instructions column no longer exists (teacher prompt cannot leak via lessons)', async () => {
      // Dropped by 20261022200000; the private prompt only lives in lessons_ai_tasks.system_prompt.
      for (const client of [student, anonA]) {
        const res = await client.from('lessons').select('ai_task_instructions').limit(1)
        expect(res.error, 'selecting a dropped column must error').not.toBeNull()
        expect(res.error?.message ?? '').toMatch(/ai_task_instructions/)
        expect(res.data ?? []).toHaveLength(0)
      }
    })

    test('the non-preview lesson of a paid course stays hidden while the preview lesson is the only one exposed', async () => {
      const res = await student.from('lessons').select('id, is_preview').eq('course_id', fx.paidCourse)
      expect(res.error).toBeNull()
      const ids = (res.data ?? []).map((r) => r.id)
      expect(ids).not.toContain(fx.lockedLesson)
      for (const r of res.data ?? []) expect(r.is_preview).toBe(true)
    })

    test('preview lessons are hidden when the school turns free_preview_enabled off (authenticated + anon)', async () => {
      // Needs 20261022140000_content_read_gates.sql (authenticated preview branch honours the switch).
      const { data: prior } = await admin
        .from('tenant_settings')
        .select('*')
        .eq('tenant_id', TENANT_A)
        .eq('setting_key', 'free_preview_enabled')
        .maybeSingle()
      try {
        const on = await student.from('lessons').select('id').eq('id', fx.previewLesson)
        expect(on.data ?? [], 'control: preview readable while the switch is on/absent').toHaveLength(1)

        const { error } = await admin
          .from('tenant_settings')
          .upsert(
            { tenant_id: TENANT_A, setting_key: 'free_preview_enabled', setting_value: { enabled: false } },
            { onConflict: 'tenant_id,setting_key' }
          )
        expect(error).toBeNull()
        const off = await student.from('lessons').select('id').eq('id', fx.previewLesson)
        expect(off.data ?? []).toHaveLength(0)
        const offAnon = await anonA.from('lessons').select('id').eq('id', fx.previewLesson)
        expect(offAnon.data ?? []).toHaveLength(0)
      } finally {
        if (prior) await admin.from('tenant_settings').upsert(prior, { onConflict: 'tenant_id,setting_key' })
        else await admin.from('tenant_settings').delete().eq('tenant_id', TENANT_A).eq('setting_key', 'free_preview_enabled')
      }
    })
  })

  // ---------------------------------------------------------------- 6
  test('6. cross-tenant: tenant A student sees nothing of tenant B (and vice versa)', async () => {
    // Fixture course + its lesson, and a seeded course Alice is entitled to.
    const courses = await student.from('courses').select('course_id').in('course_id', [fx.foreignCourse, SEEDED_TENANT_B_COURSE])
    expect(courses.data ?? []).toHaveLength(0)
    const lessons = await student.from('lessons').select('id').or(`id.eq.${fx.foreignLesson},course_id.eq.${SEEDED_TENANT_B_COURSE}`)
    expect(lessons.data ?? []).toHaveLength(0)
    const ents = await student.from('entitlements').select('entitlement_id').eq('user_id', ALICE_ID)
    expect(ents.data ?? []).toHaveLength(0)

    // Cannot write across tenants either.
    expectDenied(
      await student
        .from('entitlements')
        .insert({ user_id: STUDENT_ID, course_id: fx.foreignCourse, tenant_id: TENANT_B, source_type: 'admin_grant', status: 'active' })
        .select(),
      'cross-tenant entitlement insert'
    )
    const gfe = await student.rpc('grant_free_entitlement', { _user_id: STUDENT_ID, _course_id: fx.foreignCourse })
    expect(gfe.error, 'non-member cannot free-enroll in another tenant').not.toBeNull()
    expect(await entitlementsOf(STUDENT_ID, [fx.foreignCourse])).toHaveLength(0)

    // Reverse direction: Alice (tenant B) cannot read tenant A's gated content or the student's entitlements.
    const back = await alice.from('lessons').select('id').eq('id', fx.lockedLesson)
    expect(back.data ?? []).toHaveLength(0)
    const backEnts = await alice.from('entitlements').select('entitlement_id').eq('user_id', STUDENT_ID)
    expect(backEnts.data ?? []).toHaveLength(0)
    const anonB_ = await anonB.from('lessons').select('id').eq('id', fx.lockedLesson)
    expectDenied(anonB_, 'anon tenant B reading tenant A lesson')
  })

  // ---------------------------------------------------------------- 7
  test.describe('7. positive controls (the legitimate flows still work)', () => {
    test('grant_free_entitlement works for a genuinely free course, and only for self', async () => {
      const victim = await student.rpc('grant_free_entitlement', { _user_id: ALICE_ID, _course_id: fx.freeCourse })
      expect(victim.error, 'cannot free-enroll somebody else').not.toBeNull()
      expect(await entitlementsOf(ALICE_ID, [fx.freeCourse])).toHaveLength(0)

      const paid = await student.rpc('grant_free_entitlement', { _user_id: STUDENT_ID, _course_id: fx.paidCourse })
      expect(paid.error, 'a paid course is not free-enrollable').not.toBeNull()
      expect(await entitlementsOf(STUDENT_ID, [fx.paidCourse])).toHaveLength(0)

      const ok = await student.rpc('grant_free_entitlement', { _user_id: STUDENT_ID, _course_id: fx.freeCourse })
      expect(ok.error).toBeNull()
      const ents = await entitlementsOf(STUDENT_ID, [fx.freeCourse])
      expect(ents.map((e) => e.source_type)).toEqual(['free'])
      expect(ents[0].status).toBe('active')
    })

    test('a successful transaction (trigger path) grants the entitlement and unlocks the lesson', async () => {
      // Before: locked.
      expect((await student.from('lessons').select('id').eq('id', fx.lockedLesson)).data ?? []).toHaveLength(0)

      const { data: tx, error } = await admin
        .from('transactions')
        .insert({ user_id: STUDENT_ID, product_id: fx.paidProduct, amount: 29, status: 'successful', tenant_id: TENANT_A, payment_method: 'manual' })
        .select('transaction_id')
        .single()
      expect(error).toBeNull()
      fx.createdTx.push(tx!.transaction_id)

      const ents = await entitlementsOf(STUDENT_ID, [fx.paidCourse])
      expect(ents.some((e) => e.status === 'active' && e.source_type === 'product')).toBe(true)

      const lesson = await student.from('lessons').select('id').eq('id', fx.lockedLesson)
      expect(lesson.data ?? []).toHaveLength(1)
      // The gated AI task / exercise files open up for the entitled student only.
      expect((await student.from('lessons_ai_tasks').select('id').eq('id', fx.aiTask)).data ?? []).toHaveLength(1)
      expect((await student.from('exercise_files').select('id').eq('id', fx.exerciseFile)).data ?? []).toHaveLength(1)
      // An entitlement unlocks PUBLISHED content only (20261022140000): a draft lesson stays hidden.
      const { data: draft, error: dErr } = await admin
        .from('lessons')
        .insert({ course_id: fx.paidCourse, title: `${MARK} draft`, sequence: 3, status: 'draft', tenant_id: TENANT_A, is_preview: false })
        .select('id')
        .single()
      expect(dErr).toBeNull()
      expect((await student.from('lessons').select('id').eq('id', draft!.id)).data ?? []).toHaveLength(0)
      // ...but never another user's chat messages.
      expect((await student.from('lessons_ai_task_messages').select('id').eq('id', fx.aiMessage)).data ?? []).toHaveLength(0)
    })

    test('an ENTITLED student still cannot read lessons_ai_tasks.system_prompt (column privilege), but reads the rest', async () => {
      // Needs 20261022170000_hide_lesson_ai_system_prompt.sql. Depends on the entitlement created above.
      const prompt = await student.from('lessons_ai_tasks').select('system_prompt').eq('id', fx.aiTask)
      expect(prompt.error, 'selecting system_prompt must be a permission error').not.toBeNull()
      expect(JSON.stringify(prompt.data ?? null)).not.toContain('SYSTEM PROMPT')

      const star = await student.from('lessons_ai_tasks').select('*').eq('id', fx.aiTask)
      expect(star.error, 'select * includes the revoked column').not.toBeNull()

      // Filtering on it would be an oracle for its content.
      const oracle = await student.from('lessons_ai_tasks').select('id').ilike('system_prompt', `${MARK}%`)
      expect(oracle.error).not.toBeNull()

      const ok = await student.from('lessons_ai_tasks').select('id, task_instructions, requirements').eq('id', fx.aiTask)
      expect(ok.error).toBeNull()
      expect(ok.data ?? []).toHaveLength(1)

      const viaRpc = await student.rpc('get_lesson_ai_system_prompt', { _lesson_id: fx.lockedLesson })
      expect(viaRpc.error).toBeNull()
      expect(viaRpc.data ?? null, 'a student, entitled or not, never gets the prompt from the RPC').toBeNull()
    })

    test('anon cannot call get_lesson_ai_system_prompt / upsert_lesson_ai_task', async () => {
      const get = await anonA.rpc('get_lesson_ai_system_prompt', { _lesson_id: fx.lockedLesson })
      expect(get.error).not.toBeNull()
      const up = await anonA.rpc('upsert_lesson_ai_task', { _lesson_id: fx.lockedLesson, _task_instructions: 'x', _system_prompt: 'x' })
      expect(up.error).not.toBeNull()
    })

    test('staff reads and rewrites the prompt through the RPCs; a student cannot rewrite it', async () => {
      const { error: pin } = await admin.auth.admin.updateUserById(OWNER_ID, {
        app_metadata: { tenant_id: TENANT_A },
        user_metadata: { preferred_tenant_id: TENANT_A },
      })
      expect(pin).toBeNull()
      const teacher = await signIn(ACCOUNTS.teacher)

      const read = await teacher.rpc('get_lesson_ai_system_prompt', { _lesson_id: fx.lockedLesson })
      expect(read.error).toBeNull()
      expect(read.data).toBe(`${MARK} SYSTEM PROMPT`)

      const write = await teacher.rpc('upsert_lesson_ai_task', {
        _lesson_id: fx.lockedLesson,
        _task_instructions: 'x',
        _system_prompt: `${MARK} EDITED`,
      })
      expect(write.error).toBeNull()
      expect((await teacher.rpc('get_lesson_ai_system_prompt', { _lesson_id: fx.lockedLesson })).data).toBe(`${MARK} EDITED`)

      const hijack = await student.rpc('upsert_lesson_ai_task', {
        _lesson_id: fx.lockedLesson,
        _task_instructions: 'x',
        _system_prompt: 'student wrote this',
      })
      expect(hijack.error, 'a student cannot write the tutor prompt').not.toBeNull()
      const { data } = await admin.from('lessons_ai_tasks').select('system_prompt').eq('lesson_id', fx.lockedLesson).single()
      expect(data?.system_prompt).toBe(`${MARK} EDITED`)
    })

    test('a successful plan transaction creates the subscription and self_enroll_subscription_course then works', async () => {
      const { data: tx, error } = await admin
        .from('transactions')
        .insert({ user_id: STUDENT_ID, plan_id: fx.plan, amount: 10, status: 'successful', tenant_id: TENANT_A, payment_method: 'manual' })
        .select('transaction_id')
        .single()
      expect(error).toBeNull()
      fx.createdTx.push(tx!.transaction_id)

      const { data: subs } = await admin.from('subscriptions').select('subscription_status, end_date').eq('user_id', STUDENT_ID).eq('plan_id', fx.plan)
      expect((subs ?? []).some((s) => s.subscription_status === 'active')).toBe(true)

      const res = await student.rpc('self_enroll_subscription_course', { _course_id: fx.planOnlyCourse })
      expect(res.error).toBeNull()
      const ents = await entitlementsOf(STUDENT_ID, [fx.planOnlyCourse])
      expect(ents.map((e) => e.source_type)).toEqual(['subscription'])
    })
  })
})
