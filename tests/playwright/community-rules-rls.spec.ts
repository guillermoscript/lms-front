/**
 * Community rules live in the database — issue #846.
 *
 * Every community rule used to live in app/actions/community.ts (service
 * role), so a write through RLS — what the native app does, and what any
 * student JWT can do from supabase-js — skipped all of them. Migration
 * 20260924160000 moves them into policies and a trigger. These tests drive
 * PostgREST with real sessions (role `authenticated`) because that is the
 * surface the policies guard.
 *
 *   polls      a vote cast through RLS now counts (trigger), once, on a real option
 *   mute       a muted member cannot post, comment, react or vote — but can report
 *   posts      no pinned / prompt / graded posts from students, no course
 *              without access, no school without the community plan
 *   comments   locked, removed and unreachable posts refuse comments
 *   columns    an author edits text only — never is_hidden, is_pinned, counters
 *   reports    filed pending, about content in the reporter's school
 *   blocks     the blocker stops seeing the author; staff still see everything
 */
import { test, expect } from '@playwright/test'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ACCOUNTS } from './utils/constants'

const DEFAULT_TENANT = '00000000-0000-0000-0000-000000000001'
const CODE_ACADEMY_TENANT = '00000000-0000-0000-0000-000000000002'
const ALICE_ID = 'a1000000-0000-0000-0000-000000000004'
const CREATOR_ID = 'a1000000-0000-0000-0000-000000000003'
const STUDENT_ID = 'a1000000-0000-0000-0000-000000000001'

/** Code Academy course Alice is entitled to. */
const ALICE_COURSE = 2002

const MARK = '[E2E] 846'

function getAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await client.auth.signInWithPassword({ email, password })
  expect(error).toBeNull()
  return client
}

const asAlice = () => signIn(ACCOUNTS.tenantStudent.email, ACCOUNTS.tenantStudent.password)
const asCreator = () => signIn(ACCOUNTS.admin.email, ACCOUNTS.admin.password)
const asStudent = () => signIn(ACCOUNTS.student.email, ACCOUNTS.student.password)

/** A post written with the service role, as the admin actions do. */
async function seedPost(fields: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await getAdmin()
    .from('community_posts')
    .insert({
      tenant_id: CODE_ACADEMY_TENANT,
      author_id: CREATOR_ID,
      content: `${MARK} fixture`,
      ...fields,
    })
    .select('id')
    .single()
  expect(error).toBeNull()
  return data!.id
}

async function seedPoll(): Promise<{ postId: string; optionIds: string[] }> {
  const postId = await seedPost({ post_type: 'poll', title: `${MARK} poll` })
  const { data, error } = await getAdmin()
    .from('community_poll_options')
    .insert([
      { post_id: postId, option_text: 'A', sort_order: 0 },
      { post_id: postId, option_text: 'B', sort_order: 1 },
    ])
    .select('id, sort_order')
  expect(error).toBeNull()
  const options = [...data!].sort((a, b) => a.sort_order - b.sort_order)
  return { postId, optionIds: options.map((o) => o.id) }
}

async function voteCount(optionId: string): Promise<number> {
  const { data } = await getAdmin()
    .from('community_poll_options')
    .select('vote_count')
    .eq('id', optionId)
    .single()
  return data!.vote_count
}

async function cleanUp() {
  const admin = getAdmin()
  await admin.from('community_user_mutes').delete().eq('user_id', ALICE_ID)
  await admin.from('community_user_blocks').delete().eq('blocker_id', ALICE_ID)
  // Cascades to comments, reactions, poll options, votes and flags.
  await admin.from('community_posts').delete().like('content', `${MARK}%`)
  await admin
    .from('entitlements')
    .update({ status: 'active', revoked_at: null })
    .eq('user_id', ALICE_ID)
    .eq('course_id', ALICE_COURSE)
}

// One member's mutes and blocks are shared state: run in order.
test.describe.configure({ mode: 'serial' })

test.beforeAll(cleanUp)
test.afterAll(cleanUp)

test.describe('poll votes count through RLS (#846)', () => {
  test('a vote cast directly is counted by the trigger', async () => {
    const { postId, optionIds } = await seedPoll()
    const alice = await asAlice()

    const { error } = await alice.from('community_poll_votes').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      option_id: optionIds[0],
      user_id: ALICE_ID,
    })
    expect(error).toBeNull()
    expect(await voteCount(optionIds[0])).toBe(1)
    expect(await voteCount(optionIds[1])).toBe(0)

    // Once per poll.
    const { error: again } = await alice.from('community_poll_votes').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      option_id: optionIds[1],
      user_id: ALICE_ID,
    })
    expect(again).not.toBeNull()
    expect(await voteCount(optionIds[1])).toBe(0)
  })

  test('an option from another poll is refused', async () => {
    const first = await seedPoll()
    const second = await seedPoll()
    const alice = await asAlice()

    const { error } = await alice.from('community_poll_votes').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: first.postId,
      option_id: second.optionIds[0],
      user_id: ALICE_ID,
    })
    expect(error).not.toBeNull()
    expect(await voteCount(second.optionIds[0])).toBe(0)
  })

  test('a member cannot rewrite vote_count', async () => {
    const { optionIds } = await seedPoll()
    const alice = await asAlice()
    await alice.from('community_poll_options').update({ vote_count: 99 }).eq('id', optionIds[0])
    expect(await voteCount(optionIds[0])).toBe(0)
  })
})

test.describe('a muted member cannot write (#846)', () => {
  test.beforeEach(async () => {
    await getAdmin().from('community_user_mutes').upsert(
      {
        tenant_id: CODE_ACADEMY_TENANT,
        user_id: ALICE_ID,
        muted_by: CREATOR_ID,
        reason: MARK,
      },
      { onConflict: 'tenant_id,user_id' }
    )
  })
  test.afterEach(async () => {
    await getAdmin().from('community_user_mutes').delete().eq('user_id', ALICE_ID)
  })

  test('post, comment, reaction and vote are refused; a report still goes through', async () => {
    const postId = await seedPost()
    const { postId: pollId, optionIds } = await seedPoll()
    const alice = await asAlice()

    const post = await alice.from('community_posts').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      author_id: ALICE_ID,
      content: `${MARK} muted post`,
    })
    expect(post.error).not.toBeNull()

    const comment = await alice.from('community_comments').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      author_id: ALICE_ID,
      content: 'muted comment',
    })
    expect(comment.error).not.toBeNull()

    const reaction = await alice.from('community_reactions').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      user_id: ALICE_ID,
      reaction_type: 'like',
    })
    expect(reaction.error).not.toBeNull()

    const vote = await alice.from('community_poll_votes').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: pollId,
      option_id: optionIds[0],
      user_id: ALICE_ID,
    })
    expect(vote.error).not.toBeNull()

    const report = await alice.from('community_flags').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      reporter_id: ALICE_ID,
      reason: 'spam',
    })
    expect(report.error).toBeNull()
  })

  test('an expired mute no longer applies', async () => {
    await getAdmin()
      .from('community_user_mutes')
      .update({ muted_until: new Date(Date.now() - 60_000).toISOString() })
      .eq('user_id', ALICE_ID)
    const alice = await asAlice()
    const { error } = await alice.from('community_posts').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      author_id: ALICE_ID,
      content: `${MARK} after mute`,
    })
    expect(error).toBeNull()
  })
})

test.describe('post rules (#846)', () => {
  test('a student writes a plain post to the school feed and to their course', async () => {
    const alice = await asAlice()
    const school = await alice.from('community_posts').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      author_id: ALICE_ID,
      content: `${MARK} school`,
    })
    expect(school.error).toBeNull()

    const course = await alice.from('community_posts').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      author_id: ALICE_ID,
      course_id: ALICE_COURSE,
      content: `${MARK} course`,
    })
    expect(course.error).toBeNull()
  })

  test('a student cannot pin, lock, grade or post a prompt', async () => {
    const alice = await asAlice()
    for (const fields of [
      { is_pinned: true },
      { is_locked: true },
      { is_graded: true },
      { post_type: 'discussion_prompt' },
      { post_type: 'milestone' },
      { reaction_count: 50 },
    ]) {
      const { error } = await alice.from('community_posts').insert({
        tenant_id: CODE_ACADEMY_TENANT,
        author_id: ALICE_ID,
        content: `${MARK} ${JSON.stringify(fields)}`,
        ...fields,
      })
      expect(error, JSON.stringify(fields)).not.toBeNull()
    }
  })

  test('a course the student cannot reach is refused', async () => {
    await getAdmin()
      .from('entitlements')
      .update({ status: 'revoked' })
      .eq('user_id', ALICE_ID)
      .eq('course_id', ALICE_COURSE)
    try {
      const alice = await asAlice()
      const { error } = await alice.from('community_posts').insert({
        tenant_id: CODE_ACADEMY_TENANT,
        author_id: ALICE_ID,
        course_id: ALICE_COURSE,
        content: `${MARK} no access`,
      })
      expect(error).not.toBeNull()
    } finally {
      await getAdmin()
        .from('entitlements')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', ALICE_ID)
        .eq('course_id', ALICE_COURSE)
    }
  })

  test('a school whose plan has no community refuses posts', async () => {
    // Default School is on the free plan: features.community = false.
    const student = await asStudent()
    const { error } = await student.from('community_posts').insert({
      tenant_id: DEFAULT_TENANT,
      author_id: STUDENT_ID,
      content: `${MARK} free plan`,
    })
    expect(error).not.toBeNull()
  })

  test('an author edits the text but cannot un-hide, pin or recount', async () => {
    const alice = await asAlice()
    const { data: created, error } = await alice
      .from('community_posts')
      .insert({ tenant_id: CODE_ACADEMY_TENANT, author_id: ALICE_ID, content: `${MARK} mine` })
      .select('id')
      .single()
    expect(error).toBeNull()
    const id = created!.id

    const edit = await alice
      .from('community_posts')
      .update({ content: `${MARK} mine, edited` })
      .eq('id', id)
    expect(edit.error).toBeNull()

    for (const fields of [{ is_pinned: true }, { is_locked: true }, { reaction_count: 99 }]) {
      const { error: refused } = await alice.from('community_posts').update(fields).eq('id', id)
      expect(refused, JSON.stringify(fields)).not.toBeNull()
    }

    // A moderator removes it; the author cannot bring it back.
    await getAdmin().from('community_posts').update({ is_hidden: true }).eq('id', id)
    await alice.from('community_posts').update({ is_hidden: false }).eq('id', id)
    const { data: after } = await getAdmin()
      .from('community_posts')
      .select('is_hidden, is_pinned, content')
      .eq('id', id)
      .single()
    expect(after).toEqual({ is_hidden: true, is_pinned: false, content: `${MARK} mine, edited` })
  })
})

test.describe('comment rules (#846)', () => {
  test('locked and removed posts refuse comments; an open one takes them', async () => {
    const open = await seedPost()
    const locked = await seedPost({ is_locked: true })
    const removed = await seedPost({ is_hidden: true })
    const alice = await asAlice()

    const comment = (postId: string) =>
      alice.from('community_comments').insert({
        tenant_id: CODE_ACADEMY_TENANT,
        post_id: postId,
        author_id: ALICE_ID,
        content: 'hello',
      })

    expect((await comment(open)).error).toBeNull()
    expect((await comment(locked)).error).not.toBeNull()
    expect((await comment(removed)).error).not.toBeNull()
  })

  test('a course post refuses comments once the student loses access', async () => {
    const postId = await seedPost({ course_id: ALICE_COURSE })
    await getAdmin()
      .from('entitlements')
      .update({ status: 'revoked' })
      .eq('user_id', ALICE_ID)
      .eq('course_id', ALICE_COURSE)
    try {
      const alice = await asAlice()
      const { error } = await alice.from('community_comments').insert({
        tenant_id: CODE_ACADEMY_TENANT,
        post_id: postId,
        author_id: ALICE_ID,
        content: 'no access',
      })
      expect(error).not.toBeNull()
    } finally {
      await getAdmin()
        .from('entitlements')
        .update({ status: 'active', revoked_at: null })
        .eq('user_id', ALICE_ID)
        .eq('course_id', ALICE_COURSE)
    }
  })

  test('a reply must name a parent on the same post', async () => {
    const postA = await seedPost()
    const postB = await seedPost()
    const { data: parent } = await getAdmin()
      .from('community_comments')
      .insert({
        tenant_id: CODE_ACADEMY_TENANT,
        post_id: postA,
        author_id: CREATOR_ID,
        content: 'parent',
      })
      .select('id')
      .single()

    const alice = await asAlice()
    const { error } = await alice.from('community_comments').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postB,
      parent_comment_id: parent!.id,
      author_id: ALICE_ID,
      content: 'wrong thread',
    })
    expect(error).not.toBeNull()
  })
})

test.describe('reports (#846)', () => {
  test('a report is filed pending, once', async () => {
    const postId = await seedPost()
    const alice = await asAlice()

    const forged = await alice.from('community_flags').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      reporter_id: ALICE_ID,
      reason: 'spam',
      status: 'dismissed',
    })
    expect(forged.error).not.toBeNull()

    const filed = await alice.from('community_flags').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      reporter_id: ALICE_ID,
      reason: 'spam',
    })
    expect(filed.error).toBeNull()

    const duplicate = await alice.from('community_flags').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      reporter_id: ALICE_ID,
      reason: 'spam again',
    })
    expect(duplicate.error).not.toBeNull()

    // The reporter cannot close their own report.
    await alice.from('community_flags').update({ status: 'reviewed' }).eq('post_id', postId)
    const { data } = await getAdmin()
      .from('community_flags')
      .select('status')
      .eq('post_id', postId)
      .single()
    expect(data!.status).toBe('pending')
  })

  test('a report must name exactly one target', async () => {
    const postId = await seedPost()
    const { data: comment } = await getAdmin()
      .from('community_comments')
      .insert({ tenant_id: CODE_ACADEMY_TENANT, post_id: postId, author_id: CREATOR_ID, content: 'c' })
      .select('id')
      .single()
    const alice = await asAlice()
    const { error } = await alice.from('community_flags').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      comment_id: comment!.id,
      reporter_id: ALICE_ID,
      reason: 'both',
    })
    expect(error).not.toBeNull()
  })
})

test.describe('blocks (#846)', () => {
  test('the blocker stops seeing the author; unblocking brings them back', async () => {
    const postId = await seedPost()
    await getAdmin().from('community_comments').insert({
      tenant_id: CODE_ACADEMY_TENANT,
      post_id: postId,
      author_id: CREATOR_ID,
      content: `${MARK} comment`,
    })
    const alice = await asAlice()

    const visible = async () => {
      const { data: posts } = await alice.from('community_posts').select('id').eq('id', postId)
      const { data: comments } = await alice
        .from('community_comments')
        .select('id')
        .eq('post_id', postId)
      return { posts: posts?.length ?? 0, comments: comments?.length ?? 0 }
    }

    expect(await visible()).toEqual({ posts: 1, comments: 1 })

    const block = await alice
      .from('community_user_blocks')
      .insert({ blocker_id: ALICE_ID, blocked_id: CREATOR_ID })
    expect(block.error).toBeNull()
    expect(await visible()).toEqual({ posts: 0, comments: 0 })

    // Staff moderate what they see: a block never hides content from them.
    const creator = await asCreator()
    const { data: creatorBlocks } = await creator
      .from('community_user_blocks')
      .select('blocker_id')
    expect(creatorBlocks).toEqual([])

    const unblock = await alice
      .from('community_user_blocks')
      .delete()
      .eq('blocker_id', ALICE_ID)
      .eq('blocked_id', CREATOR_ID)
    expect(unblock.error).toBeNull()
    expect(await visible()).toEqual({ posts: 1, comments: 1 })
  })

  test('a block can only be written by the blocker, and not on oneself', async () => {
    const alice = await asAlice()
    const forged = await alice
      .from('community_user_blocks')
      .insert({ blocker_id: CREATOR_ID, blocked_id: ALICE_ID })
    expect(forged.error).not.toBeNull()

    const self = await alice
      .from('community_user_blocks')
      .insert({ blocker_id: ALICE_ID, blocked_id: ALICE_ID })
    expect(self.error).not.toBeNull()
  })
})
