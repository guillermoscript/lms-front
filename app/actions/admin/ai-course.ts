'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/config'
import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { checkCourseLimit } from '@/app/actions/teacher/courses'
import { courseLimitMessage, isPlanLimitError } from '@/lib/billing/plan-limit-error'
import { aiGenerationLimiter } from '@/lib/rate-limit'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'

/** Hard cap on generated lessons (issue #441). */
const MAX_LESSONS = 8

/** Generations allowed per user per hour. */
const GENERATIONS_PER_HOUR = 5

const outlineSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(120)
    .describe('Concise, appealing course title'),
  description: z
    .string()
    .min(30)
    .max(600)
    .describe('2-3 sentence course description shown on the catalog card'),
  thumbnailPrompt: z
    .string()
    .max(300)
    .describe(
      'One-sentence image-generation prompt the owner can use to create a course thumbnail'
    ),
  lessons: z
    .array(
      z.object({
        title: z.string().min(3).max(150),
        content: z
          .string()
          .min(80)
          .max(2000)
          .describe(
            'Markdown content stub: 2-4 short sections with headings and 1-2 sentences each, ending with a "> TODO:" note telling the author what to expand'
          ),
      })
    )
    .min(3)
    .max(MAX_LESSONS)
    .describe(`Course outline of ${MAX_LESSONS} lessons or fewer, in teaching order`),
})

export interface StarterCourseResult {
  courseId: number
  lessonCount: number
  thumbnailPrompt: string
  /** The first generated lesson, so the UI can open it for review (#675). */
  firstLessonId: number | null
}

export interface StarterLessonsResult {
  courseId: number
  lessonCount: number
  firstLessonId: number | null
}

/** Lessons-only outline, for drafting into a course that already exists. */
const lessonsOutlineSchema = z.object({
  lessons: outlineSchema.shape.lessons,
})

/**
 * Blank-page killer (issue #441): the owner describes the course in a
 * sentence, the server drafts a course outline (title, description, up to
 * MAX_LESSONS lessons with Markdown stubs) and persists everything as DRAFT
 * content the owner edits. Nothing auto-publishes.
 *
 * Uses the server-side OPENAI_API_KEY via the shared AI SDK config — never
 * the NEXT_PUBLIC_ key.
 */
export async function generateStarterCourse(
  description: string
): Promise<ActionResult<StarterCourseResult>> {
  // Hoisted so the catch below can report the failed generation with the same
  // attribution as the success path. `generationStartedAt` stays 0 until we
  // actually call the model, which is what keeps a rejected request (bad role,
  // rate limit, plan limit) from being counted as a failed generation.
  let analyticsCtx: { userId?: string; tenantId?: string; role?: string } = {}
  let generationStartedAt = 0

  try {
    const role = await getUserRole()
    if (role !== 'teacher' && role !== 'admin') {
      throw new Error('Unauthorized: Only teachers and admins can generate courses')
    }

    const userId = await getCurrentUserId()
    if (!userId) {
      throw new Error('Not authenticated')
    }
    const tenantId = await getCurrentTenantId()

    const prompt = description.trim()
    if (prompt.length < 10) {
      throw new Error('Please describe the course in at least a short sentence.')
    }
    if (prompt.length > 500) {
      throw new Error('Please keep the description under 500 characters.')
    }

    try {
      await aiGenerationLimiter.check(GENERATIONS_PER_HOUR, `starter-course:${userId}`)
    } catch {
      throw new Error(
        'You have reached the hourly limit for AI generations. Please try again later.'
      )
    }

    // Same plan-limit gate as manual course creation — fail before spending
    // tokens so free-plan owners see the upgrade message, not a silent error.
    const limitCheck = await checkCourseLimit()
    if (!limitCheck.canCreate) {
      throw new Error(courseLimitMessage(limitCheck))
    }

    analyticsCtx = { userId, tenantId, role }
    generationStartedAt = Date.now()
    await track(
      ANALYTICS_EVENTS.COURSE_AI_GENERATION_STARTED,
      { prompt_length: prompt.length, max_lessons: MAX_LESSONS },
      analyticsCtx
    )

    const { object: outline } = await propagateAttributes(
      { userId, metadata: { tenantId } },
      () => generateObject({
      model: AI_MODELS.starterCourse,
      schema: outlineSchema,
      system:
        'You draft starter courses for an online school platform. The school owner gives a one-sentence description; you produce a practical, well-sequenced course outline. Every lesson gets a short Markdown content stub the owner will expand — not full lesson text. Write all output in the same language as the owner’s description.',
      prompt: `The school owner describes the course they want to create:\n\n"${prompt}"\n\nDraft the course: a title, a catalog description, a thumbnail image prompt, and an outline of at most ${MAX_LESSONS} lessons in teaching order. Each lesson content stub should use Markdown headings and end with a "> TODO:" line telling the author what to fill in.`,
      experimental_telemetry: { functionId: 'starter-course-generator' },
      }),
    )

    // Auth and role are validated above; use the admin client like
    // createCourse() does, since JWT tenant_role claims can be stale for RLS.
    const adminClient = createAdminClient()

    // The course FK requires the author's profile to exist.
    await adminClient
      .from('profiles')
      .upsert({ id: userId }, { onConflict: 'id', ignoreDuplicates: true })

    const { data: course, error: courseError } = await adminClient
      .from('courses')
      .insert({
        title: outline.title,
        description: outline.description,
        thumbnail_url: null,
        category_id: null,
        author_id: userId,
        tenant_id: tenantId,
        status: 'draft',
      })
      .select('course_id')
      .single()

    if (courseError) {
      // Trigger-level rejection (#658) — same copy as the pre-check above.
      if (isPlanLimitError(courseError)) {
        throw new Error(courseLimitMessage(await checkCourseLimit()))
      }
      throw courseError
    }

    const lessonRows = outline.lessons.slice(0, MAX_LESSONS).map((lesson, index) => ({
      course_id: course.course_id,
      tenant_id: tenantId,
      title: lesson.title,
      description: null,
      content: lesson.content,
      video_url: null,
      sequence: index + 1,
      status: 'draft' as const,
      publish_at: null,
    }))

    const { data: insertedLessons, error: lessonsError } = await adminClient
      .from('lessons')
      .insert(lessonRows)
      .select('id, sequence')
    if (lessonsError) {
      // Don't leave an empty shell course behind if the outline failed to persist.
      await adminClient
        .from('courses')
        .delete()
        .eq('course_id', course.course_id)
        .eq('tenant_id', tenantId)
      throw lessonsError
    }

    await track(
      ANALYTICS_EVENTS.COURSE_AI_GENERATION_COMPLETED,
      {
        success: true,
        duration_ms: Date.now() - generationStartedAt,
        lesson_count: lessonRows.length,
        course_id: course.course_id,
      },
      analyticsCtx
    )
    // The generator persists a real course, so Loop B's `course_created` fires
    // here too — with `via: 'ai'`, which is how we compare the blank-page killer
    // against manual authoring. Nothing auto-publishes, so no `course_published`.
    await track(
      ANALYTICS_EVENTS.COURSE_CREATED,
      { course_id: course.course_id, via: 'ai', status: 'draft', lesson_count: lessonRows.length },
      analyticsCtx
    )

    revalidatePath('/dashboard/admin')
    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/teacher/courses')

    return {
      success: true,
      data: {
        courseId: course.course_id,
        lessonCount: lessonRows.length,
        thumbnailPrompt: outline.thumbnailPrompt,
        firstLessonId: firstLessonId(insertedLessons),
      },
    }
  } catch (error) {
    console.error('generateStarterCourse failed:', error)
    if (generationStartedAt) {
      await track(
        ANALYTICS_EVENTS.COURSE_AI_GENERATION_COMPLETED,
        {
          success: false,
          duration_ms: Date.now() - generationStartedAt,
          failure_reason: error instanceof Error ? error.message : 'unknown',
        },
        analyticsCtx
      )
    }
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to generate the course draft',
    }
  }
}

function firstLessonId(rows: Array<{ id: number; sequence: number | null }> | null): number | null {
  if (!rows || rows.length === 0) return null
  return [...rows].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))[0].id
}

/**
 * "Generate with AI" on an empty course (#675): drafts up to MAX_LESSONS
 * lessons into a course that already exists, from its title and description.
 * Same role, rate-limit and tenant checks as `generateStarterCourse`; the
 * course must belong to the caller's tenant and be authored by them (the
 * lesson editor is author-only, so anything else would draft lessons the
 * caller cannot open). Nothing auto-publishes.
 */
export async function generateStarterLessons(
  courseId: number
): Promise<ActionResult<StarterLessonsResult>> {
  let analyticsCtx: { userId?: string; tenantId?: string; role?: string } = {}
  let generationStartedAt = 0

  try {
    const role = await getUserRole()
    if (role !== 'teacher' && role !== 'admin') {
      throw new Error('Unauthorized: Only teachers and admins can generate lessons')
    }

    const userId = await getCurrentUserId()
    if (!userId) {
      throw new Error('Not authenticated')
    }
    const tenantId = await getCurrentTenantId()

    if (!Number.isInteger(courseId) || courseId <= 0) {
      throw new Error('Invalid course')
    }

    const adminClient = createAdminClient()
    const { data: course } = await adminClient
      .from('courses')
      .select('course_id, title, description, tenant_id, author_id, lessons(id)')
      .eq('course_id', courseId)
      .is('deleted_at', null)
      .single()

    if (!course || course.tenant_id !== tenantId || course.author_id !== userId) {
      throw new Error('Access denied')
    }
    if ((course.lessons?.length ?? 0) > 0) {
      throw new Error('This course already has lessons. Add the next one by hand.')
    }

    try {
      await aiGenerationLimiter.check(GENERATIONS_PER_HOUR, `starter-course:${userId}`)
    } catch {
      throw new Error(
        'You have reached the hourly limit for AI generations. Please try again later.'
      )
    }

    analyticsCtx = { userId, tenantId, role }
    generationStartedAt = Date.now()
    await track(
      ANALYTICS_EVENTS.COURSE_AI_GENERATION_STARTED,
      { prompt_length: course.title.length, max_lessons: MAX_LESSONS, mode: 'lessons', course_id: courseId },
      analyticsCtx
    )

    const courseBrief = [
      `Title: "${course.title}"`,
      course.description ? `Description: "${course.description}"` : null,
    ]
      .filter(Boolean)
      .join('\n')

    const { object: outline } = await propagateAttributes(
      { userId, metadata: { tenantId } },
      () => generateObject({
        model: AI_MODELS.starterCourse,
        schema: lessonsOutlineSchema,
        system:
          'You draft lesson outlines for an online school platform. The course already exists; you produce a practical, well-sequenced list of lessons for it. Every lesson gets a short Markdown content stub the owner will expand — not full lesson text. Write all output in the same language as the course title and description.',
        prompt: `The course:\n\n${courseBrief}\n\nDraft an outline of at most ${MAX_LESSONS} lessons in teaching order. Each lesson content stub should use Markdown headings and end with a "> TODO:" line telling the author what to fill in.`,
        experimental_telemetry: { functionId: 'starter-lessons-generator' },
      }),
    )

    const lessonRows = outline.lessons.slice(0, MAX_LESSONS).map((lesson, index) => ({
      course_id: courseId,
      tenant_id: tenantId,
      title: lesson.title,
      description: null,
      content: lesson.content,
      video_url: null,
      sequence: index + 1,
      status: 'draft' as const,
      publish_at: null,
    }))

    const { data: insertedLessons, error: lessonsError } = await adminClient
      .from('lessons')
      .insert(lessonRows)
      .select('id, sequence')
    if (lessonsError) throw lessonsError

    await track(
      ANALYTICS_EVENTS.COURSE_AI_GENERATION_COMPLETED,
      {
        success: true,
        duration_ms: Date.now() - generationStartedAt,
        lesson_count: lessonRows.length,
        course_id: courseId,
        mode: 'lessons',
      },
      analyticsCtx
    )

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath('/dashboard/admin')
    revalidatePath('/dashboard/teacher/courses')

    return {
      success: true,
      data: {
        courseId,
        lessonCount: lessonRows.length,
        firstLessonId: firstLessonId(insertedLessons),
      },
    }
  } catch (error) {
    console.error('generateStarterLessons failed:', error)
    if (generationStartedAt) {
      await track(
        ANALYTICS_EVENTS.COURSE_AI_GENERATION_COMPLETED,
        {
          success: false,
          duration_ms: Date.now() - generationStartedAt,
          failure_reason: error instanceof Error ? error.message : 'unknown',
          mode: 'lessons',
        },
        analyticsCtx
      )
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate lessons',
    }
  }
}
