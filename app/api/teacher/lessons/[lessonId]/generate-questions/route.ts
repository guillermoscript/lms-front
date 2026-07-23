/**
 * POST /api/teacher/lessons/[lessonId]/generate-questions  (#398)
 *
 * Drafts 5-10 retrieval questions from a lesson's content (and its video
 * transcript when one can be fetched) for the teacher to review in the
 * lesson editor. This endpoint only GENERATES — nothing is persisted here;
 * approved drafts are saved by the saveApprovedQuestions server action as
 * draft exercises.
 *
 * Guard order (same as /api/landing/generate): auth → tenant → role →
 * ownership → rate limit → generate. Fail before spending tokens.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { aiGenerationLimiter } from '@/lib/rate-limit'
import { AI_MODELS } from '@/lib/ai/config'
import { getLessonTranscript, type LessonTranscript } from '@/lib/lessons/video-transcript'
import type { GenerateQuestionsResponse } from '@/lib/lessons/generated-questions'
import { generateObject } from 'ai'
import { z } from 'zod'

export const maxDuration = 120

const GENERATIONS_PER_HOUR = 10
const MAX_CONTENT_CHARS = 24_000
const MAX_TRANSCRIPT_CHARS = 16_000
const MIN_QUESTIONS = 5
const MAX_QUESTIONS = 10

// OpenAI strict structured output rejects `.optional()` and z.record, so every
// field is always present: [] / -1 are the "not applicable" sentinels (see
// app/api/landing/generate/route.ts for the same constraint).
const generationSchema = z.object({
  questions: z
    .array(
      z.object({
        kind: z.enum(['short_answer', 'fill_in_the_blank', 'multiple_choice']),
        title: z.string().min(3).max(120).describe('Short exercise title'),
        prompt: z
          .string()
          .min(10)
          .describe('The question shown to the student, answerable from the lesson alone'),
        rubric: z
          .string()
          .min(10)
          .describe('What a passing answer must show — concrete, checkable criteria'),
        expected_keywords: z
          .array(z.string())
          .describe('short_answer only: key terms a good answer mentions. [] for other kinds.'),
        accepted_answers: z
          .array(z.string())
          .describe('fill_in_the_blank only: accepted answers, lowercase. [] for other kinds.'),
        options: z
          .array(z.string())
          .describe('multiple_choice only: 3-5 options with plausible distractors. [] for other kinds.'),
        correct_index: z
          .number()
          .describe('multiple_choice only: index of the correct option. -1 for other kinds.'),
        explanation: z
          .string()
          .describe('Shown to the student after answering: why the correct answer is correct.'),
        difficulty: z.enum(['easy', 'medium', 'hard']),
        video_timestamp_seconds: z
          .number()
          .describe(
            'If a timestamped transcript is provided: the second where this concept is explained, taken from a segment start. -1 when no transcript or unsure.'
          ),
      })
    )
    .min(MIN_QUESTIONS)
    .max(MAX_QUESTIONS),
})

function transcriptForPrompt(transcript: LessonTranscript): string {
  const lines: string[] = []
  let total = 0
  for (const seg of transcript.segments) {
    const line = `[${Math.floor(seg.start / 60)}:${String(Math.floor(seg.start % 60)).padStart(2, '0')} @ ${seg.start}s] ${seg.text}`
    total += line.length + 1
    if (total > MAX_TRANSCRIPT_CHARS) break
    lines.push(line)
  }
  return lines.join('\n')
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId: lessonIdParam } = await params
  const lessonId = Number(lessonIdParam)
  if (!Number.isInteger(lessonId) || lessonId <= 0) {
    return Response.json({ error: 'Invalid lesson id' }, { status: 400 })
  }

  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!tenantId) return Response.json({ error: 'No tenant context' }, { status: 400 })

  // tenant_users is the authoritative role source; checked with the admin
  // client using the getUser()-verified id (the x-user-id header is not
  // forwarded to API route handlers).
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('tenant_users')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  const role = membership?.role
  if (role !== 'teacher' && role !== 'admin') {
    return Response.json(
      { error: 'Question generation requires teacher or admin access.' },
      { status: 403 }
    )
  }

  // Lesson must belong to this tenant, and teachers must own its course.
  const { data: lesson } = await admin
    .from('lessons')
    .select('id, course_id, title, content, video_url, transcript, courses(author_id)')
    .eq('id', lessonId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!lesson) return Response.json({ error: 'Lesson not found' }, { status: 404 })

  const authorId = (lesson.courses as unknown as { author_id: string } | null)?.author_id
  if (role !== 'admin' && authorId !== user.id) {
    return Response.json({ error: 'You do not own this course.' }, { status: 403 })
  }

  try {
    await aiGenerationLimiter.check(GENERATIONS_PER_HOUR, `lesson-questions:${user.id}`)
  } catch {
    return Response.json(
      { error: 'Too many generations. Please try again in a while.' },
      { status: 429 }
    )
  }

  // The editor sends its CURRENT content (possibly unsaved) so the teacher
  // generates from what they see, not from the last-saved DB row.
  let bodyContent: string | undefined
  try {
    const body = (await req.json()) as { content?: string }
    if (typeof body.content === 'string') bodyContent = body.content
  } catch {
    // empty body is fine — fall back to the stored lesson content
  }

  const content = (bodyContent ?? lesson.content ?? '').slice(0, MAX_CONTENT_CHARS).trim()
  if (content.length < 80) {
    return Response.json(
      { error: 'The lesson needs more content before questions can be generated.' },
      { status: 422 }
    )
  }

  const transcript = await getLessonTranscript(admin, {
    id: lesson.id,
    video_url: lesson.video_url,
    transcript: (lesson.transcript as LessonTranscript | null) ?? null,
  })

  const system = `You draft retrieval-practice questions for an online lesson. Rules:
- Every question must be answerable from the provided lesson content alone — never require outside knowledge.
- One concept per question. No compound questions.
- At least half of the questions must be generative recall (short_answer or fill_in_the_blank), not recognition. Use multiple_choice only where distractors genuinely discriminate, and make distractors plausible.
- Rubrics must be concrete and checkable ("names the import statement and explains namespace collision", not "understands imports").
- fill_in_the_blank prompts contain exactly one blank written as "____"; accepted_answers lists every reasonable normalized form, lowercase.
- Write all output in the same language as the lesson content.${
    transcript
      ? '\n- A timestamped video transcript is provided. For EVERY question, scan the transcript: if the video explains the concept anywhere (even if the lesson text also covers it), you MUST set video_timestamp_seconds to that segment\'s start (the number after @ in [m:ss @ Ns]). Only use -1 when the transcript never touches the concept. Most questions about material the video covers should carry a timestamp.'
      : '\n- No video transcript is available: always set video_timestamp_seconds to -1.'
  }`

  const prompt = `## Lesson: ${lesson.title}

## Lesson content (MDX):
${content}
${transcript ? `\n## Video transcript (${transcript.language}), one segment per line as [m:ss @ Ns] text:\n${transcriptForPrompt(transcript)}\n` : ''}
Draft ${MIN_QUESTIONS}-${MAX_QUESTIONS} questions following the rules.`

  try {
    const { object } = await generateObject({
      model: AI_MODELS.questionGenerator,
      schema: generationSchema,
      system,
      prompt,
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'lesson-question-generator',
        metadata: { userId: user.id, tenantId, lessonId },
      },
    })

    const response: GenerateQuestionsResponse = {
      questions: object.questions,
      transcript_used: Boolean(transcript),
      transcript_language: transcript?.language ?? null,
    }
    return Response.json(response)
  } catch (err) {
    console.error('lesson-question generation failed:', err)
    return Response.json(
      { error: 'Question generation failed. Please try again.' },
      { status: 502 }
    )
  }
}
