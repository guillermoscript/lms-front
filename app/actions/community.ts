'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { hasCourseAccess } from '@/lib/services/course-access'
import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { getBlockedAuthorIds } from '@/lib/community/blocks'
import { getFeedPage } from '@/lib/community/feed'
import { parsePostMedia } from '@/lib/community/media'
import type { CommunityPost } from '@/components/community/community-feed'

type ProfileSummary = { id: string; full_name: string | null; avatar_url: string | null }
type CommentRow = {
  id: string
  content: string
  created_at: string
  author_id: string
  parent_comment_id: string | null
  is_hidden: boolean
}

const MAX_CONTENT_LENGTH = 5000
const MAX_COMMENT_LENGTH = 2000

// Helper to check if user is muted
async function isUserMuted(tenantId: string, userId: string): Promise<boolean> {
  const adminClient = createAdminClient()
  const { data } = await adminClient
    .from('community_user_mutes')
    .select('id, muted_until')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .single()

  if (!data) return false
  if (!data.muted_until) return true // indefinite mute
  return new Date(data.muted_until) > new Date()
}

// Helper to get authenticated user or throw
async function getAuthenticatedUser() {
  const supabase = await createClient()
  const userId = await getCurrentUserId()
  if (!userId) throw new Error('Not authenticated')
  return { supabase, userId }
}

/**
 * Where a new post or poll may go (#860). Mirrors `community_can_post_to` in
 * RLS: a course of this tenant the caller can reach (staff always), a lesson
 * of that course, and — for students — the school feed only while the school
 * allows it. The service-role insert below bypasses RLS, so this is the gate.
 */
async function checkPostTarget(
  tenantId: string,
  userId: string,
  role: string | null,
  courseId: number | null,
  lessonId: number | null
): Promise<string | null> {
  if (!role) return 'You are not a member of this school'
  const adminClient = createAdminClient()

  if (courseId === null) {
    if (lessonId !== null) return 'A lesson needs a course'
    if (role !== 'student') return null
    const { data: setting } = await adminClient
      .from('tenant_settings')
      .select('setting_value')
      .eq('tenant_id', tenantId)
      .eq('setting_key', 'community_student_posts_school_feed')
      .maybeSingle()
    return (setting?.setting_value as { enabled?: boolean } | null)?.enabled === false
      ? 'Students are not allowed to post in the school feed'
      : null
  }

  const { data: course } = await adminClient
    .from('courses')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!course) return 'Course not found'

  if (role !== 'teacher' && role !== 'admin' && !(await hasCourseAccess(adminClient, userId, courseId))) {
    return 'You must be enrolled in this course to post'
  }

  if (lessonId !== null) {
    const { data: lesson } = await adminClient
      .from('lessons')
      .select('id')
      .eq('id', lessonId)
      .eq('course_id', courseId)
      .maybeSingle()
    if (!lesson) return 'Lesson not found in this course'
  }

  return null
}

function parsePositiveId(raw: FormDataEntryValue | null): number | null | 'invalid' {
  if (raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : 'invalid'
}

/**
 * Create a post (standard or discussion_prompt)
 */
export async function createPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()

    // Check mute status
    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted and cannot create posts' }
    }

    const content = formData.get('content') as string
    const title = formData.get('title') as string | null
    const postType = (formData.get('post_type') as string) || 'standard'
    const courseId = parsePositiveId(formData.get('course_id'))
    const lessonId = parsePositiveId(formData.get('lesson_id'))
    const isGraded = formData.get('is_graded') === 'true'

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: `Content must be under ${MAX_CONTENT_LENGTH} characters` }
    }

    if (courseId === 'invalid') return { success: false, error: 'Invalid course ID' }
    if (lessonId === 'invalid') return { success: false, error: 'Invalid lesson ID' }

    // Polls go through createPoll (they need options); milestones are system posts.
    if (postType !== 'standard' && postType !== 'discussion_prompt') {
      return { success: false, error: 'Invalid post type' }
    }

    // Students cannot create discussion prompts or graded posts
    if (role === 'student' && (postType === 'discussion_prompt' || isGraded)) {
      return { success: false, error: 'Only teachers and admins can create this type of post' }
    }

    const media = parsePostMedia(formData.get('media_urls') as string | null, {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
      tenantId,
      userId,
    })
    if (media === null) {
      return { success: false, error: 'Invalid attachments' }
    }

    const targetError = await checkPostTarget(tenantId, userId, role, courseId, lessonId)
    if (targetError) return { success: false, error: targetError }

    // Use admin client to bypass RLS for insert (JWT tenant_id may not match header tenant_id)
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('community_posts')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        content: content.trim(),
        title: title?.trim() || null,
        post_type: postType,
        media_urls: media,
        course_id: courseId,
        lesson_id: lessonId,
        is_graded: isGraded,
      })
      .select('id')
      .single()

    if (error) throw error

    // The server action, not the composer: this is the accurate chokepoint and
    // the only one that survives an adblocker. `course_scoped` separates a
    // course conversation from school-feed chatter — the two behave nothing
    // alike and a school cares about the first.
    await track(
      ANALYTICS_EVENTS.COMMUNITY_POST_CREATED,
      {
        post_type: postType,
        has_poll: false,
        course_scoped: Boolean(courseId),
        lesson_scoped: Boolean(lessonId),
        is_graded: isGraded,
        media_count: media.length,
        content_length: content.trim().length,
      },
      { userId, tenantId, role }
    )

    revalidatePath('/dashboard')
    if (courseId) {
      revalidatePath(`/dashboard/student/courses/${courseId}`)
      revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    console.error('Failed to create post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create post',
    }
  }
}

/**
 * Edit your own post's text (#860). Authors only — moderators hide, they do
 * not rewrite; that matches the author-only UPDATE policy the native app hits.
 */
export async function updatePost(
  postId: string,
  content: string,
  title?: string
): Promise<ActionResult> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    if (content.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: `Content must be under ${MAX_CONTENT_LENGTH} characters` }
    }

    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted and cannot edit posts' }
    }

    const adminClient = createAdminClient()
    const { data: post } = await adminClient
      .from('community_posts')
      .select('id, author_id, post_type, is_hidden')
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!post || post.is_hidden) {
      return { success: false, error: 'Post not found' }
    }
    if (post.author_id !== userId) {
      return { success: false, error: 'You can only edit your own posts' }
    }

    const trimmedTitle = title?.trim() || null
    if (post.post_type === 'poll') {
      if (!trimmedTitle) return { success: false, error: 'Title is required for polls' }
    } else if (content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({
        content: content.trim(),
        title: trimmedTitle,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('tenant_id', tenantId)
      .eq('author_id', userId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to update post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update post',
    }
  }
}

/**
 * Delete (soft) a post by setting is_hidden = true
 */
export async function deletePost(postId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()

    // Fetch the post to verify ownership or admin/teacher role
    const adminClient = createAdminClient()
    const { data: post, error: fetchError } = await adminClient
      .from('community_posts')
      .select('id, author_id, tenant_id')
      .eq('id', postId)
      .single()

    if (fetchError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    if (post.author_id !== userId && role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'You can only delete your own posts' }
    }

    const { error } = await adminClient
      .from('community_posts')
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to delete post:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete post',
    }
  }
}

/**
 * Create a comment on a post
 */
export async function createComment(
  postId: string,
  content: string,
  parentCommentId?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

    if (content.length > MAX_COMMENT_LENGTH) {
      return { success: false, error: `Comment must be under ${MAX_COMMENT_LENGTH} characters` }
    }

    // Check mute status
    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted and cannot comment' }
    }

    // Verify post exists, belongs to tenant, and is not locked
    const adminClient = createAdminClient()
    const { data: post, error: postError } = await adminClient
      .from('community_posts')
      .select('id, tenant_id, course_id, is_locked, is_hidden')
      .eq('id', postId)
      .single()

    if (postError || !post) {
      return { success: false, error: 'Post not found' }
    }

    if (post.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    if (post.is_locked) {
      return { success: false, error: 'This post is locked and does not accept new comments' }
    }

    if (post.is_hidden) {
      return { success: false, error: 'This post has been removed' }
    }

    // For course-scoped posts, verify access (students only)
    if (post.course_id) {
      const role = await getUserRole()
      if (role === 'student') {
        if (!(await hasCourseAccess(adminClient, userId, post.course_id))) {
          return { success: false, error: 'You must be enrolled in this course to comment' }
        }
      }
    }

    // If replying to a parent comment, verify it exists
    if (parentCommentId) {
      const { data: parentComment } = await adminClient
        .from('community_comments')
        .select('id, post_id')
        .eq('id', parentCommentId)
        .eq('post_id', postId)
        .single()

      if (!parentComment) {
        return { success: false, error: 'Parent comment not found' }
      }
    }

    // Use admin client to bypass RLS for insert (JWT tenant_id may not match header tenant_id)
    const insertClient = createAdminClient()
    const { data, error } = await insertClient
      .from('community_comments')
      .insert({
        post_id: postId,
        tenant_id: tenantId,
        author_id: userId,
        content: content.trim(),
        parent_comment_id: parentCommentId || null,
      })
      .select('id')
      .single()

    if (error) throw error

    // `is_reply` is the interesting cut: a top-level comment is a response to
    // the school, a threaded reply is students talking to each other.
    await track(
      ANALYTICS_EVENTS.COMMUNITY_COMMENT_CREATED,
      {
        post_id: postId,
        is_reply: Boolean(parentCommentId),
        content_length: content.trim().length,
      },
      { userId, tenantId }
    )

    revalidatePath('/dashboard')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    console.error('Failed to create comment:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create comment',
    }
  }
}

/**
 * Delete (soft) a comment by setting is_hidden = true
 */
export async function deleteComment(commentId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()

    // Fetch the comment to verify ownership or admin/teacher role
    const adminClient = createAdminClient()
    const { data: comment, error: fetchError } = await adminClient
      .from('community_comments')
      .select('id, author_id, tenant_id')
      .eq('id', commentId)
      .single()

    if (fetchError || !comment) {
      return { success: false, error: 'Comment not found' }
    }

    if (comment.tenant_id !== tenantId) {
      return { success: false, error: 'Access denied' }
    }

    if (comment.author_id !== userId && role !== 'admin' && role !== 'teacher') {
      return { success: false, error: 'You can only delete your own comments' }
    }

    const { error } = await adminClient
      .from('community_comments')
      .update({ is_hidden: true, updated_at: new Date().toISOString() })
      .eq('id', commentId)
      .eq('tenant_id', tenantId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to delete comment:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete comment',
    }
  }
}

/**
 * Toggle reaction on a post or comment
 */
export async function toggleReaction(
  targetType: 'post' | 'comment',
  targetId: string,
  reactionType: 'like' | 'helpful' | 'insightful' | 'fire'
): Promise<ActionResult<{ added: boolean }>> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    // Muted users cannot react
    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted' }
    }

    const adminClient = createAdminClient()

    // Check if reaction already exists
    let query = adminClient
      .from('community_reactions')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('reaction_type', reactionType)

    if (targetType === 'post') {
      query = query.eq('post_id', targetId).is('comment_id', null)
    } else {
      query = query.eq('comment_id', targetId)
    }

    const { data: existing } = await query.single()

    if (existing) {
      // Remove existing reaction
      const { error } = await adminClient
        .from('community_reactions')
        .delete()
        .eq('id', existing.id)
        .eq('tenant_id', tenantId)

      if (error) throw error

      revalidatePath('/dashboard')
      return { success: true, data: { added: false } }
    } else {
      // Add new reaction
      const insertData: Record<string, unknown> = {
        tenant_id: tenantId,
        user_id: userId,
        reaction_type: reactionType,
      }

      if (targetType === 'post') {
        insertData.post_id = targetId
      } else {
        insertData.comment_id = targetId
      }

      const { error } = await adminClient
        .from('community_reactions')
        .insert(insertData)

      if (error) throw error

      // Only the ADD branch. The remove branch above is an un-react, and
      // counting both would make a user toggling a reaction on and off look
      // like rising engagement.
      await track(
        ANALYTICS_EVENTS.REACTION_ADDED,
        { target_type: targetType, reaction_type: reactionType },
        { userId, tenantId }
      )

      revalidatePath('/dashboard')
      return { success: true, data: { added: true } }
    }
  } catch (err) {
    console.error('Failed to toggle reaction:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to toggle reaction',
    }
  }
}

/**
 * Create a poll (post with poll options)
 */
export async function createPoll(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()

    // Check mute status
    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted and cannot create polls' }
    }

    const title = formData.get('title') as string
    const content = formData.get('content') as string
    const optionsRaw = formData.get('options') as string
    const courseId = parsePositiveId(formData.get('course_id'))

    if (courseId === 'invalid') return { success: false, error: 'Invalid course ID' }

    if (!title || title.trim().length === 0) {
      return { success: false, error: 'Title is required for polls' }
    }

    // The question is the title; the body is optional context.
    const body = (content ?? '').trim()

    let options: string[]
    try {
      options = JSON.parse(optionsRaw)
    } catch {
      return { success: false, error: 'Invalid options format' }
    }

    if (!Array.isArray(options)) {
      return { success: false, error: 'Invalid options format' }
    }

    // Filter out empty options, then re-validate minimum count
    options = options.filter((o) => typeof o === 'string' && o.trim().length > 0)

    if (options.length < 2) {
      return { success: false, error: 'At least 2 poll options are required' }
    }

    if (options.length > 10) {
      return { success: false, error: 'Maximum 10 poll options allowed' }
    }

    if (options.some((o) => o.length > 200)) {
      return { success: false, error: 'Each poll option must be under 200 characters' }
    }

    if (title.length > 200 || body.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: `Content must be under ${MAX_CONTENT_LENGTH} characters` }
    }

    // Check student poll setting if applicable
    if (role === 'student') {
      const adminClient = createAdminClient()
      const { data: setting } = await adminClient
        .from('tenant_settings')
        .select('setting_value')
        .eq('tenant_id', tenantId)
        .eq('setting_key', 'community_student_polls')
        .maybeSingle()

      if ((setting?.setting_value as { enabled?: boolean } | null)?.enabled === false) {
        return { success: false, error: 'Students are not allowed to create polls' }
      }
    }

    const targetError = await checkPostTarget(tenantId, userId, role, courseId, null)
    if (targetError) return { success: false, error: targetError }

    // Use admin client for transaction-like behavior (insert post + options)
    const adminClient = createAdminClient()

    // Create the post
    const { data: post, error: postError } = await adminClient
      .from('community_posts')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        title: title.trim(),
        content: body,
        post_type: 'poll',
        course_id: courseId,
      })
      .select('id')
      .single()

    if (postError) throw postError

    // Insert poll options
    const pollOptions = options.map((optionText, index) => ({
      post_id: post.id,
      option_text: optionText.trim(),
      sort_order: index,
      vote_count: 0,
    }))

    const { error: optionsError } = await adminClient
      .from('community_poll_options')
      .insert(pollOptions)

    if (optionsError) {
      // Clean up the post if options fail
      await adminClient
        .from('community_posts')
        .delete()
        .eq('id', post.id)
        .eq('tenant_id', tenantId)
      throw optionsError
    }

    // Same event as `createPost`, with `has_poll: true` — a poll IS a post
    // (`post_type: 'poll'`) written by a second action, and splitting it into
    // its own event name would silently under-count every post total.
    // Deliberately after the options insert: the branch above deletes the post
    // when options fail, so tracking earlier would count a post that no longer
    // exists.
    await track(
      ANALYTICS_EVENTS.COMMUNITY_POST_CREATED,
      {
        post_type: 'poll',
        has_poll: true,
        course_scoped: Boolean(courseId),
        lesson_scoped: false,
        option_count: options.length,
        content_length: body.length,
      },
      { userId, tenantId, role }
    )

    revalidatePath('/dashboard')
    if (courseId) {
      revalidatePath(`/dashboard/student/courses/${courseId}`)
      revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    }

    return { success: true, data: { id: post.id } }
  } catch (err) {
    console.error('Failed to create poll:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create poll',
    }
  }
}

/**
 * Cast a vote on a poll option
 */
export async function castVote(postId: string, optionId: string): Promise<ActionResult> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    // Muted users cannot vote
    if (await isUserMuted(tenantId, userId)) {
      return { success: false, error: 'You are currently muted' }
    }

    const adminClient = createAdminClient()

    // Verify the post is a poll and belongs to this tenant
    const { data: post } = await adminClient
      .from('community_posts')
      .select('id, tenant_id, post_type, is_hidden')
      .eq('id', postId)
      .single()

    if (!post || post.tenant_id !== tenantId) {
      return { success: false, error: 'Poll not found' }
    }

    if (post.post_type !== 'poll') {
      return { success: false, error: 'This post is not a poll' }
    }

    if (post.is_hidden) {
      return { success: false, error: 'This poll has been removed' }
    }

    // Verify the option belongs to this post
    const { data: option } = await adminClient
      .from('community_poll_options')
      .select('id, post_id')
      .eq('id', optionId)
      .eq('post_id', postId)
      .single()

    if (!option) {
      return { success: false, error: 'Poll option not found' }
    }

    // Check if user already voted on this poll
    const { data: existingVote } = await adminClient
      .from('community_poll_votes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('tenant_id', tenantId)
      .single()

    if (existingVote) {
      return { success: false, error: 'You have already voted on this poll' }
    }

    // Insert vote
    const { error: voteError } = await adminClient
      .from('community_poll_votes')
      .insert({
        post_id: postId,
        option_id: optionId,
        user_id: userId,
        tenant_id: tenantId,
      })

    if (voteError) throw voteError

    // vote_count is maintained by the trg_community_poll_vote_count trigger (#846).

    // One vote per user per poll is enforced above, so this cannot double-count.
    await track(
      ANALYTICS_EVENTS.POLL_VOTED,
      { post_id: postId },
      { userId, tenantId }
    )

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to cast vote:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to cast vote',
    }
  }
}

/**
 * Upload a community asset (image, video, PDF)
 */
export async function uploadCommunityAsset(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    const file = formData.get('file') as File | null

    if (!file) {
      return { success: false, error: 'No file provided' }
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    if (file.size > MAX_FILE_SIZE) {
      return { success: false, error: 'File size must be under 10MB' }
    }

    const ALLOWED_TYPES = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
      'application/pdf',
    ]

    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        success: false,
        error: 'File type not allowed. Use JPEG, PNG, GIF, WebP, MP4, WebM, or PDF.',
      }
    }

    const sanitizedName = file.name.replace(/[\/\\:*?"<>|]/g, '')
    const ext = sanitizedName.split('.').pop()?.toLowerCase() || 'bin'
    const fileName = `${nanoid()}.${ext}`
    const filePath = `${tenantId}/${userId}/${fileName}`

    const adminClient = createAdminClient()
    const { error } = await adminClient.storage
      .from('community-assets')
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      })

    if (error) throw error

    const { data: urlData } = adminClient.storage
      .from('community-assets')
      .getPublicUrl(filePath)

    return {
      success: true,
      data: { url: urlData.publicUrl },
    }
  } catch (err) {
    console.error('Failed to upload community asset:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to upload file',
    }
  }
}

/**
 * Create a flag (report) on a post or comment
 */
export async function createFlag(
  targetType: 'post' | 'comment',
  targetId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()

    if (!reason.trim() || reason.length > 1000) {
      return { success: false, error: 'Reason is required and must be under 1000 characters' }
    }

    const adminClient = createAdminClient()

    const insertData: Record<string, unknown> = {
      tenant_id: tenantId,
      reporter_id: userId,
      reason: reason.trim(),
    }

    if (targetType === 'post') {
      insertData.post_id = targetId
    } else {
      insertData.comment_id = targetId
    }

    const { error } = await adminClient.from('community_flags').insert(insertData)

    if (error) throw error

    return { success: true }
  } catch (err) {
    console.error('Failed to create flag:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit report',
    }
  }
}

/**
 * Block a member: their posts and comments stop showing for the caller.
 * Written through RLS — the row can only ever name the caller as blocker.
 */
export async function blockUser(blockedId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    if (blockedId === userId) {
      return { success: false, error: 'You cannot block yourself' }
    }

    const { error } = await supabase
      .from('community_user_blocks')
      .upsert(
        { blocker_id: userId, blocked_id: blockedId },
        { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }
      )

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to block user:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to block user',
    }
  }
}

export async function unblockUser(blockedId: string): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()

    const { error } = await supabase
      .from('community_user_blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_id', blockedId)

    if (error) throw error

    revalidatePath('/dashboard')
    return { success: true }
  } catch (err) {
    console.error('Failed to unblock user:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to unblock user',
    }
  }
}

/**
 * The members the caller has blocked, with their names, for the unblock list.
 */
export async function getBlockedMembers(): Promise<
  ActionResult<{ members: ProfileSummary[] }>
> {
  try {
    const { userId } = await getAuthenticatedUser()
    const blockedIds = await getBlockedAuthorIds(userId)
    if (blockedIds.length === 0) {
      return { success: true, data: { members: [] } }
    }

    const { data: profiles, error } = await createAdminClient()
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', blockedIds)

    if (error) throw error
    return { success: true, data: { members: profiles ?? [] } }
  } catch (err) {
    console.error('Failed to load blocked members:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load blocked members',
    }
  }
}

/**
 * Get comments for a post (uses admin client to bypass RLS tenant mismatch)
 */
export async function getComments(
  postId: string,
  tenantId: string
): Promise<ActionResult<{ comments: CommentRow[]; profiles: ProfileSummary[] }>> {
  try {
    const { userId } = await getAuthenticatedUser()
    const adminClient = createAdminClient()
    const blockedIds = await getBlockedAuthorIds(userId)

    let commentsQuery = adminClient
      .from('community_comments')
      .select('id, content, created_at, author_id, parent_comment_id, is_hidden')
      .eq('post_id', postId)
      .eq('tenant_id', tenantId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: true })

    if (blockedIds.length > 0) {
      commentsQuery = commentsQuery.not('author_id', 'in', `(${blockedIds.join(',')})`)
    }

    const { data: commentsData, error } = await commentsQuery

    if (error) throw error
    if (!commentsData || commentsData.length === 0) {
      return { success: true, data: { comments: [], profiles: [] } }
    }

    const authorIds = Array.from(new Set(commentsData.map((c) => c.author_id)))
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', authorIds)

    return {
      success: true,
      data: { comments: commentsData, profiles: profiles || [] },
    }
  } catch (err) {
    console.error('Failed to load comments:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load comments',
    }
  }
}

/**
 * Next page of a feed for infinite scroll (#860).
 *
 * Tenant and viewer come from the request, never the client, and a course
 * feed re-checks access: `getFeedPage` reads with the service role, so this
 * is the only thing between a caller and another school's or course's feed.
 */
export async function loadMorePosts(
  scope: 'school' | 'course',
  cursor: string, // created_at of last post
  courseId?: number
): Promise<ActionResult<{ posts: CommunityPost[]; hasMore: boolean }>> {
  try {
    const { userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()
    if (!role) return { success: false, error: 'Access denied' }

    if (Number.isNaN(Date.parse(cursor))) {
      return { success: false, error: 'Invalid cursor' }
    }

    if (scope === 'course') {
      if (!courseId || !Number.isInteger(courseId) || courseId <= 0) {
        return { success: false, error: 'Invalid course ID' }
      }
      const adminClient = createAdminClient()
      const { data: course } = await adminClient
        .from('courses')
        .select('course_id')
        .eq('course_id', courseId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (!course) return { success: false, error: 'Course not found' }
      if (role === 'student' && !(await hasCourseAccess(adminClient, userId, courseId))) {
        return { success: false, error: 'Access denied' }
      }
    }

    const page = await getFeedPage({ tenantId, viewerId: userId, scope, courseId, cursor })
    return { success: true, data: page }
  } catch (err) {
    console.error('Failed to load more posts:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load posts',
    }
  }
}
