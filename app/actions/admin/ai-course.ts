'use server'

import { revalidatePath } from 'next/cache'
import { generateObject } from 'ai'
import { z } from 'zod'
import { AI_MODELS } from '@/lib/ai/config'
import { createAdminClient, type ActionResult } from '@/lib/supabase/admin'
import { getUserRole } from '@/lib/supabase/get-user-role'
import { getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { checkCourseLimit } from '@/app/actions/teacher/courses'
import { aiGenerationLimiter } from '@/lib/rate-limit'

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
}

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
      throw new Error(
        `Your ${limitCheck.plan} plan is limited to ${limitCheck.limit} courses. ` +
          `You currently have ${limitCheck.currentCount} courses.`
      )
    }

    const { object: outline } = await generateObject({
      model: AI_MODELS.starterCourse,
      schema: outlineSchema,
      system:
        'You draft starter courses for an online school platform. The school owner gives a one-sentence description; you produce a practical, well-sequenced course outline. Every lesson gets a short Markdown content stub the owner will expand — not full lesson text. Write all output in the same language as the owner’s description.',
      prompt: `The school owner describes the course they want to create:\n\n"${prompt}"\n\nDraft the course: a title, a catalog description, a thumbnail image prompt, and an outline of at most ${MAX_LESSONS} lessons in teaching order. Each lesson content stub should use Markdown headings and end with a "> TODO:" line telling the author what to fill in.`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'starter-course-generator',
        metadata: { userId, tenantId },
      },
    })

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

    if (courseError) throw courseError

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

    const { error: lessonsError } = await adminClient.from('lessons').insert(lessonRows)
    if (lessonsError) {
      // Don't leave an empty shell course behind if the outline failed to persist.
      await adminClient
        .from('courses')
        .delete()
        .eq('course_id', course.course_id)
        .eq('tenant_id', tenantId)
      throw lessonsError
    }

    revalidatePath('/dashboard/admin')
    revalidatePath('/dashboard/admin/products')
    revalidatePath('/dashboard/teacher/courses')

    return {
      success: true,
      data: {
        courseId: course.course_id,
        lessonCount: lessonRows.length,
        thumbnailPrompt: outline.thumbnailPrompt,
      },
    }
  } catch (error) {
    console.error('generateStarterCourse failed:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'Failed to generate the course draft',
    }
  }
}
