import { getApiAuthContext } from '@/lib/supabase/api-auth'
import { AI_CONFIG, AI_MODELS, DEFAULT_PASSING_SCORE } from '@/lib/ai/config'
import { buildAristotlePrompt } from '@/lib/ai/aristotle-prompt'
import { lastUserMessageText } from '@/lib/ai/chat-helpers'
import { convertToModelMessages, stepCountIs, streamText } from 'ai'
import { hasCourseAccess } from '@/lib/services/course-access'
import { z } from 'zod'

export const maxDuration = 120

const SESSION_IDLE_MINUTES = 30

const bodySchema = z.object({
    messages: z.array(z.any()),
    courseId: z.coerce.number().int().positive(),
    contextPage: z.string().optional(),
})

export async function POST(req: Request) {
    const auth = await getApiAuthContext(req)
    if (!auth) return new Response('Unauthorized', { status: 401 })
    const { supabase, user, tenantId } = auth

    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return new Response('Invalid request body', { status: 400 })
    const { messages, courseId, contextPage } = parsed.data

    const numericCourseId = courseId

    // Verify access (entitlements model)
    if (!(await hasCourseAccess(supabase, user.id, numericCourseId))) {
        return new Response('Not enrolled', { status: 403 })
    }

    // Fetch tutor config
    const { data: tutorConfig } = await supabase
        .from('course_ai_tutors')
        .select('*')
        .eq('course_id', numericCourseId)
        .eq('tenant_id', tenantId)
        .single()

    if (!tutorConfig?.enabled) return new Response('Aristotle is not enabled for this course', { status: 404 })

    // Fetch course structure, progress, and session summaries in parallel
    const [
        { data: course },
        { data: lessons },
        { data: exercises },
        { data: exams },
        { data: completions },
        { data: exerciseCompletions },
        { data: examSubmissions },
        { data: pastSessions },
    ] = await Promise.all([
        supabase
            .from('courses')
            .select('course_id, title, description')
            .eq('course_id', numericCourseId)
            .eq('tenant_id', tenantId)
            .single(),
        supabase
            .from('lessons')
            .select('id, title, description, sequence')
            .eq('course_id', numericCourseId)
            .eq('status', 'published')
            .eq('tenant_id', tenantId)
            .order('sequence'),
        supabase
            .from('exercises')
            .select('id, title, type, difficulty')
            .eq('course_id', numericCourseId)
            .eq('status', 'published')
            .eq('tenant_id', tenantId),
        supabase
            .from('exams')
            .select('exam_id, title')
            .eq('course_id', numericCourseId)
            .eq('status', 'published')
            .eq('tenant_id', tenantId),
        supabase
            .from('lesson_completions')
            .select('lesson_id')
            .eq('user_id', user.id),
        supabase
            .from('exercise_completions')
            .select('exercise_id, score')
            .eq('user_id', user.id),
        supabase
            .from('exam_submissions')
            .select('exam_id, score')
            .eq('student_id', user.id)
            .eq('tenant_id', tenantId),
        supabase
            .from('aristotle_sessions')
            .select('summary, topics_discussed, started_at')
            .eq('course_id', numericCourseId)
            .eq('user_id', user.id)
            .eq('tenant_id', tenantId)
            .not('summary', 'is', null)
            .order('started_at', { ascending: false })
            .limit(5),
    ])

    if (!course) return new Response('Course not found', { status: 404 })

    // Get or create session
    const cutoff = new Date(Date.now() - SESSION_IDLE_MINUTES * 60 * 1000).toISOString()
    const { data: activeSession } = await supabase
        .from('aristotle_sessions')
        .select('session_id')
        .eq('course_id', numericCourseId)
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .is('ended_at', null)
        .gte('started_at', cutoff)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    let sessionId: string

    if (activeSession) {
        sessionId = activeSession.session_id
    } else {
        const { data: newSession, error } = await supabase
            .from('aristotle_sessions')
            .insert({
                course_id: numericCourseId,
                user_id: user.id,
                tenant_id: tenantId,
            })
            .select('session_id')
            .single()

        if (error || !newSession) return new Response('Failed to create session', { status: 500 })
        sessionId = newSession.session_id
    }

    // Build lesson context if on a specific lesson page
    let contextDetail: string | null = null
    if (contextPage) {
        const lessonMatch = contextPage.match(/\/lessons\/(\d+)/)
        if (lessonMatch) {
            const lessonId = parseInt(lessonMatch[1])
            const lesson = lessons?.find(l => l.id === lessonId)
            if (lesson) {
                contextDetail = `Lesson ${lesson.sequence}: ${lesson.title}${lesson.description ? ` — ${lesson.description}` : ''}`
            }
        }
        const exerciseMatch = contextPage.match(/\/exercises\/(\d+)/)
        if (exerciseMatch) {
            const exerciseId = parseInt(exerciseMatch[1])
            const exercise = exercises?.find(e => e.id === exerciseId)
            if (exercise) {
                contextDetail = `Exercise: ${exercise.title} (${exercise.type})`
            }
        }
    }

    // Calculate progress
    const completedLessonIds = completions?.map(c => c.lesson_id) || []
    const courseLessonIds = new Set(lessons?.map(l => l.id) || [])
    const relevantCompletions = completedLessonIds.filter(id => courseLessonIds.has(id))
    const totalLessons = lessons?.length || 0
    const overallPercent = totalLessons > 0 ? Math.round((relevantCompletions.length / totalLessons) * 100) : 0

    // exercise_completions has no tenant scope and spans all courses — limit to
    // the exercises that belong to this course (mirrors the lesson handling above).
    const courseExerciseIds = new Set(exercises?.map(e => e.id) || [])
    const relevantExerciseCompletions = (exerciseCompletions || []).filter(e => courseExerciseIds.has(e.exercise_id))

    // Build exam results with pass/fail
    const examResults = (examSubmissions || []).map(s => {
        const exam = exams?.find(e => e.exam_id === s.exam_id)
        return {
            exam_id: s.exam_id,
            score: s.score,
            passed: (s.score || 0) >= DEFAULT_PASSING_SCORE,
        }
    })

    // Build system prompt
    const systemPrompt = buildAristotlePrompt({
        config: {
            persona: tutorConfig.persona || '',
            teaching_approach: tutorConfig.teaching_approach || '',
            boundaries: tutorConfig.boundaries || '',
        },
        course: {
            title: course.title,
            description: course.description,
            lessons: lessons || [],
            exercises: (exercises || []).map(e => ({ ...e, difficulty: e.difficulty || null })),
            exams: exams || [],
        },
        progress: {
            completedLessonIds: relevantCompletions,
            exerciseScores: relevantExerciseCompletions.map(e => ({
                exercise_id: e.exercise_id,
                score: e.score,
            })),
            examResults,
            overallPercent,
        },
        sessionSummaries: (pastSessions || []).filter(s => s.summary).map(s => ({
            summary: s.summary!,
            topics_discussed: s.topics_discussed || [],
            started_at: s.started_at,
        })),
        contextPage,
        contextDetail,
    })

    // Save user message
    const messageText = lastUserMessageText(messages)
    if (messageText) {
        await supabase.from('aristotle_messages').insert({
            session_id: sessionId,
            role: 'user',
            content: messageText,
            context_page: contextPage || null,
        })
    }

    // Stream response
    const result = streamText({
        model: AI_MODELS.aristotle,
        system: systemPrompt,
        messages: await convertToModelMessages(messages),
        experimental_telemetry: { isEnabled: true, functionId: 'aristotle-assistant', metadata: { userId: user.id, tenantId, contextPage: contextPage || '' } },
        onFinish: async (event) => {
            if (event.text) {
                const { error } = await supabase.from('aristotle_messages').insert({
                    session_id: sessionId,
                    role: 'assistant',
                    content: event.text,
                    context_page: contextPage || null,
                })
                if (error) console.error('Failed to persist aristotle assistant message:', error)
            }
        },
        stopWhen: stepCountIs(AI_CONFIG.maxSteps),
    })

    return result.toUIMessageStreamResponse()
}
