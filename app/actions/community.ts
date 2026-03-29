'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { revalidatePath } from 'next/cache'
import { nanoid } from 'nanoid'

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
    const courseId = formData.get('course_id') as string | null
    const lessonId = formData.get('lesson_id') as string | null
    const isGraded = formData.get('is_graded') === 'true'

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return { success: false, error: `Content must be under ${MAX_CONTENT_LENGTH} characters` }
    }

    // Validate IDs are positive integers
    if (courseId && (isNaN(parseInt(courseId)) || parseInt(courseId) <= 0)) {
      return { success: false, error: 'Invalid course ID' }
    }
    if (lessonId && (isNaN(parseInt(lessonId)) || parseInt(lessonId) <= 0)) {
      return { success: false, error: 'Invalid lesson ID' }
    }

    // Students cannot create discussion_prompt or milestone posts
    if (role === 'student' && (postType === 'discussion_prompt' || postType === 'milestone')) {
      return { success: false, error: 'Only teachers and admins can create this type of post' }
    }

    // Validate courseId belongs to tenant before insert
    if (courseId) {
      const verifyClient = createAdminClient()
      const { data: course } = await verifyClient
        .from('courses')
        .select('course_id')
        .eq('course_id', parseInt(courseId))
        .eq('tenant_id', tenantId)
        .single()
      if (!course) {
        return { success: false, error: 'Course not found' }
      }

      // Verify enrollment for students posting to a course feed
      if (role === 'student') {
        const { data: enrollment } = await verifyClient
          .from('enrollments')
          .select('enrollment_id')
          .eq('course_id', parseInt(courseId))
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .single()
        if (!enrollment) {
          return { success: false, error: 'You must be enrolled in this course to post' }
        }
      }

      // If lessonId is provided, verify it belongs to the course
      if (lessonId) {
        const { data: lesson } = await verifyClient
          .from('lessons')
          .select('id')
          .eq('id', parseInt(lessonId))
          .eq('course_id', parseInt(courseId))
          .single()
        if (!lesson) {
          return { success: false, error: 'Lesson not found in this course' }
        }
      }
    }

    // For school-level posts (no course_id) by students, check tenant setting
    if (!courseId && role === 'student') {
      const adminClient = createAdminClient()
      const { data: setting } = await adminClient
        .from('tenant_settings')
        .select('setting_value')
        .eq('tenant_id', tenantId)
        .eq('setting_key', 'community_student_posts_school_feed')
        .single()

      if (setting && setting.setting_value?.enabled === false) {
        return { success: false, error: 'Students are not allowed to post in the school feed' }
      }
    }

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
        course_id: courseId ? parseInt(courseId) : null,
        lesson_id: lessonId ? parseInt(lessonId) : null,
        is_graded: isGraded,
      })
      .select('id')
      .single()

    if (error) throw error

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
 * Update a post
 */
export async function updatePost(
  postId: string,
  content: string,
  title?: string
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser()
    const tenantId = await getCurrentTenantId()
    const role = await getUserRole()

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

    // Fetch the post to verify ownership or admin role
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
      return { success: false, error: 'You can only edit your own posts' }
    }

    const { error } = await supabase
      .from('community_posts')
      .update({
        content: content.trim(),
        title: title?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .eq('tenant_id', tenantId)

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

    // For course-scoped posts, verify enrollment (students only)
    if (post.course_id) {
      const role = await getUserRole()
      if (role === 'student') {
        const { data: enrollment } = await adminClient
          .from('enrollments')
          .select('enrollment_id')
          .eq('course_id', post.course_id)
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
          .single()
        if (!enrollment) {
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
    const courseId = formData.get('course_id') as string | null

    if (!title || title.trim().length === 0) {
      return { success: false, error: 'Title is required for polls' }
    }

    if (!content || content.trim().length === 0) {
      return { success: false, error: 'Content is required' }
    }

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

    // Check student poll setting if applicable
    if (role === 'student') {
      const adminClient = createAdminClient()
      const { data: setting } = await adminClient
        .from('tenant_settings')
        .select('setting_value')
        .eq('tenant_id', tenantId)
        .eq('setting_key', 'community_student_polls')
        .single()

      if (setting && setting.setting_value?.enabled === false) {
        return { success: false, error: 'Students are not allowed to create polls' }
      }
    }

    // Use admin client for transaction-like behavior (insert post + options)
    const adminClient = createAdminClient()

    // Create the post
    const { data: post, error: postError } = await adminClient
      .from('community_posts')
      .insert({
        tenant_id: tenantId,
        author_id: userId,
        title: title.trim(),
        content: content.trim(),
        post_type: 'poll',
        course_id: courseId || null,
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

    // Increment vote count on the option.
    // NOTE: This SELECT+UPDATE has a theoretical race condition if two users vote
    // simultaneously, but supabase-js does not support SQL expressions (e.g. vote_count + 1)
    // in .update(). The risk is minimal for polls, and the canonical count can always be
    // recomputed from community_poll_votes if needed.
    const { data: currentOption } = await adminClient
      .from('community_poll_options')
      .select('vote_count')
      .eq('id', optionId)
      .single()

    if (currentOption) {
      await adminClient
        .from('community_poll_options')
        .update({ vote_count: (currentOption.vote_count || 0) + 1 })
        .eq('id', optionId)
    }

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
 * Get comments for a post (uses admin client to bypass RLS tenant mismatch)
 */
export async function getComments(
  postId: string,
  tenantId: string
): Promise<ActionResult<{ comments: any[]; profiles: any[] }>> {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    const { data: commentsData, error } = await adminClient
      .from('community_comments')
      .select('id, content, created_at, author_id, parent_comment_id, is_hidden')
      .eq('post_id', postId)
      .eq('tenant_id', tenantId)
      .eq('is_hidden', false)
      .order('created_at', { ascending: true })

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

const POSTS_PAGE_SIZE = 20

/**
 * Load more posts for infinite scroll (uses admin client to bypass RLS tenant mismatch)
 */
export async function loadMorePosts(
  tenantId: string,
  userId: string,
  scope: 'school' | 'course',
  cursor: string, // created_at of last post
  courseId?: number
): Promise<ActionResult<{ posts: any[]; hasMore: boolean }>> {
  try {
    await getAuthenticatedUser()
    const adminClient = createAdminClient()

    let query = adminClient
      .from('community_posts')
      .select(`
        id, author_id, post_type, title, content, media_urls,
        is_pinned, is_locked, comment_count, reaction_count,
        created_at, course_id, lesson_id, is_graded,
        milestone_type, milestone_data
      `)
      .eq('tenant_id', tenantId)
      .eq('is_hidden', false)
      .eq('is_pinned', false)
      .lt('created_at', cursor)
      .order('created_at', { ascending: false })
      .limit(POSTS_PAGE_SIZE)

    if (scope === 'course' && courseId) {
      query = query.eq('course_id', courseId)
    } else if (scope === 'school') {
      query = query.is('course_id', null)
    }

    const { data: posts, error } = await query
    if (error) throw error
    if (!posts || posts.length === 0) {
      return { success: true, data: { posts: [], hasMore: false } }
    }

    // Enrich with profiles, reactions, poll data
    const authorIds = [...new Set(posts.map((p) => p.author_id))]
    const postIds = posts.map((p) => p.id)

    const [{ data: profiles }, { data: reactions }, { data: pollOptions }, { data: pollVotes }] =
      await Promise.all([
        adminClient.from('profiles').select('id, full_name, avatar_url').in('id', authorIds),
        adminClient.from('community_reactions').select('post_id, reaction_type').eq('user_id', userId).in('post_id', postIds),
        adminClient.from('community_poll_options').select('id, post_id, option_text, vote_count, sort_order').in('post_id', postIds),
        adminClient.from('community_poll_votes').select('post_id, option_id').eq('user_id', userId).in('post_id', postIds),
      ])

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
    const reactionsMap = new Map<string, string[]>()
    for (const r of reactions ?? []) {
      const existing = reactionsMap.get(r.post_id) ?? []
      existing.push(r.reaction_type)
      reactionsMap.set(r.post_id, existing)
    }
    const pollOptionsMap = new Map<string, any[]>()
    for (const o of pollOptions ?? []) {
      const existing = pollOptionsMap.get(o.post_id) ?? []
      existing.push(o)
      pollOptionsMap.set(o.post_id, existing)
    }
    const pollVotesMap = new Map<string, string>()
    for (const v of pollVotes ?? []) {
      pollVotesMap.set(v.post_id, v.option_id)
    }

    const enrichedPosts = posts.map((post) => ({
      ...post,
      media_urls: post.media_urls || [],
      author: profileMap.get(post.author_id) ?? { id: post.author_id, full_name: null, avatar_url: null },
      user_reactions: reactionsMap.get(post.id) ?? [],
      poll_options: pollOptionsMap.get(post.id) ?? undefined,
      user_voted_option: pollVotesMap.get(post.id) ?? null,
    }))

    return {
      success: true,
      data: { posts: enrichedPosts, hasMore: posts.length >= POSTS_PAGE_SIZE },
    }
  } catch (err) {
    console.error('Failed to load more posts:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to load posts',
    }
  }
}
