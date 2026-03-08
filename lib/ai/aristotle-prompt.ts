/**
 * Aristotle — Course-level AI tutor system prompt builder
 *
 * Assembles context from:
 * 1. Teacher config (persona, teaching approach, boundaries)
 * 2. Course structure (lessons, exercises, exams)
 * 3. Student progress (completions, scores)
 * 4. Memory digest (past session summaries)
 * 5. Current page context (floating panel)
 * 6. Behavioral guardrails (hardcoded)
 */

interface TutorConfig {
    persona: string
    teaching_approach: string
    boundaries: string
}

interface CourseStructure {
    title: string
    description: string | null
    lessons: { id: number; title: string; description: string | null; sequence: number }[]
    exercises: { id: number; title: string; type: string; difficulty: string | null }[]
    exams: { exam_id: number; title: string; passing_score: number | null }[]
}

interface StudentProgress {
    completedLessonIds: number[]
    exerciseScores: { exercise_id: number; score: number | null }[]
    examResults: { exam_id: number; score: number | null; passed: boolean }[]
    overallPercent: number
}

interface SessionSummary {
    summary: string
    topics_discussed: string[]
    started_at: string
}

interface AristotlePromptInput {
    config: TutorConfig
    course: CourseStructure
    progress: StudentProgress
    sessionSummaries: SessionSummary[]
    contextPage?: string | null
    contextDetail?: string | null
}

export function buildAristotlePrompt(input: AristotlePromptInput): string {
    const { config, course, progress, sessionSummaries, contextPage, contextDetail } = input

    const sections: string[] = []

    // 1. Teacher config
    sections.push(`## Your Identity & Approach
${config.persona || 'You are a knowledgeable and patient AI tutor for this course.'}

Teaching approach: ${config.teaching_approach || 'Be supportive and guide students to understanding through questions and examples.'}

${config.boundaries ? `Boundaries set by the teacher:\n${config.boundaries}` : ''}`)

    // 2. Course structure
    const lessonList = course.lessons
        .map(l => `  ${l.sequence}. ${l.title}${l.description ? ` — ${l.description}` : ''}`)
        .join('\n')

    const exerciseList = course.exercises
        .map(e => `  - ${e.title} (${e.type}${e.difficulty ? `, ${e.difficulty}` : ''})`)
        .join('\n')

    const examList = course.exams
        .map(e => `  - ${e.title}${e.passing_score ? ` (passing: ${e.passing_score}%)` : ''}`)
        .join('\n')

    sections.push(`## Course: ${course.title}
${course.description || ''}

Lessons:
${lessonList || '  (no lessons yet)'}

Exercises:
${exerciseList || '  (no exercises yet)'}

Exams:
${examList || '  (no exams yet)'}`)

    // 3. Student progress
    const totalLessons = course.lessons.length
    const completedLessons = progress.completedLessonIds.length

    const completedLessonTitles = course.lessons
        .filter(l => progress.completedLessonIds.includes(l.id))
        .map(l => l.title)

    const incompleteLessonTitles = course.lessons
        .filter(l => !progress.completedLessonIds.includes(l.id))
        .map(l => l.title)

    sections.push(`## Student Progress (${progress.overallPercent}% overall)
Lessons: ${completedLessons}/${totalLessons} completed
${completedLessonTitles.length > 0 ? `Completed: ${completedLessonTitles.join(', ')}` : ''}
${incompleteLessonTitles.length > 0 ? `Remaining: ${incompleteLessonTitles.join(', ')}` : ''}

${progress.exerciseScores.length > 0 ? `Exercise scores: ${progress.exerciseScores.map(e => {
    const exercise = course.exercises.find(ex => ex.id === e.exercise_id)
    return `${exercise?.title || 'Unknown'}: ${e.score ?? 'not scored'}`
}).join(', ')}` : ''}

${progress.examResults.length > 0 ? `Exam results: ${progress.examResults.map(e => {
    const exam = course.exams.find(ex => ex.exam_id === e.exam_id)
    return `${exam?.title || 'Unknown'}: ${e.score}% (${e.passed ? 'passed' : 'not passed'})`
}).join(', ')}` : ''}`)

    // 4. Memory digest
    if (sessionSummaries.length > 0) {
        const memoryText = sessionSummaries
            .map((s, i) => `Session ${i + 1} (${new Date(s.started_at).toLocaleDateString()}): ${s.summary}${s.topics_discussed.length > 0 ? ` [Topics: ${s.topics_discussed.join(', ')}]` : ''}`)
            .join('\n\n')

        sections.push(`## Memory — Past Conversations
${memoryText}`)
    }

    // 5. Current context (floating panel)
    if (contextPage) {
        sections.push(`## Current Context
The student is currently viewing: ${contextPage}
${contextDetail || ''}`)
    }

    // 6. Behavioral guardrails
    sections.push(`## Rules (non-negotiable)
- You are Aristotle, a course-level AI tutor. You help students understand course material deeply.
- You may generate practice problems, mini-explanations, and study plans on the fly.
- NEVER assign scores, grades, or XP. Practice problems are for learning only — no pass/fail.
- NEVER complete exercises, exams, or lessons for the student. Those are handled by separate systems.
- Focus on UNDERSTANDING, not memorization. Ask probing questions to verify comprehension.
- When generating practice problems, clearly label them as "Practice" so students know they're informal.
- Reference specific lessons and course content when relevant ("In Lesson 3, you learned about...").
- If the student asks about something outside the course scope, briefly acknowledge it but redirect to course topics.
- Be encouraging but honest. If a student misunderstands something, correct them clearly.
- Keep responses focused and concise. Avoid walls of text — use structure (lists, steps, examples).`)

    return sections.join('\n\n')
}
