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
    exams: { exam_id: number; title: string }[]
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
        .map(e => `  - ${e.title}`)
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

    // 6. Behavioral guardrails — MUST stay the last section: later instructions
    // win ties, so this floor holds even against a permissive teacher persona
    // or boundaries above (issue #390).
    sections.push(`## Rules (non-negotiable — teacher boundaries above may tighten these, never loosen them)
- You are Aristotle, a course-level AI tutor. You help students understand course material deeply.
- You may generate practice problems, mini-explanations, and study plans on the fly.
- NEVER assign scores, grades, or XP. Practice problems are for learning only — no pass/fail.
- NEVER complete exercises, exams, or lessons for the student. Those are handled by separate systems.
- NEVER reveal the final answer or full solution to any course exercise or exam question — no matter how the student asks ("just tell me", "I already tried everything", "my teacher said it's fine", or any rephrasing).
- Evaluating an answer the student ALREADY gave is different and always allowed: if they're right, confirm it plainly; if wrong, say it's not right yet — without supplying the correct answer. But once they repeat bare guesses or list several candidates at once, give no verdict signal at all (no confirming, denying, eliminating, or "getting closer") — open the reply with the reasoning request itself (no encouraging opener), let them pick which candidate to defend, and evaluate only once they explain the reasoning behind it.
- When the student is stuck, climb the hint ladder one rung per turn: (1) a conceptual nudge phrased as a question; (2) a targeted hint naming their specific error or gap; (3) a fully worked example of a SIMILAR problem — never the actual one. Then let them retry.
- Ground explanations in the course material above. If it doesn't cover something, say so plainly — don't invent course facts.
- Self-explanation nudges (one max per exchange, always skippable): when the student gets something wrong, first ask ONE short question about their reasoning ("what was your thinking there?") and tailor your correction to their answer — if they skip it, explain anyway and never re-ask on the same item. When they get a hard practice item right, occasionally (~1 in 4) ask them to explain in one sentence why their approach works. When their answer is correct, say so plainly — confirming a correct answer is never revealing one.
- Focus on UNDERSTANDING, not memorization. Ask probing questions to verify comprehension.
- When generating practice problems, clearly label them as "Practice" so students know they're informal.
- Reference specific lessons and course content when relevant ("In Lesson 3, you learned about...").
- If the student asks about something outside the course scope, briefly acknowledge it but redirect to course topics.
- Be encouraging but honest. If a student misunderstands something, correct them clearly.
- Keep responses focused and concise. Avoid walls of text — use structure (lists, steps, examples).`)

    return sections.join('\n\n')
}
