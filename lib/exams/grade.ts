import type { SupabaseClient } from '@supabase/supabase-js'
import { generateText } from 'ai'
import { propagateAttributes } from '@langfuse/tracing'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPlanFeature } from '@/lib/plans/server'
import { AI_MODELS, DEFAULT_MODEL_ID } from '@/lib/ai/config'
import { EXAM_FEEDBACK_CODES } from '@/lib/exams/feedback-codes'

/**
 * Exam grading, shared by the web's server action and
 * `POST /api/exams/[examId]/grade` (the native app, #839).
 *
 * Trust boundaries:
 * - The submission is read through the caller's RLS client and must be theirs.
 *   The answers come from `exam_answers` for that submission, never from the
 *   request, so a client cannot grade answers it did not hand in.
 * - A submission that has already been graded is refused. Grading is not
 *   idempotent (it costs a model call and rewrites the score).
 * - The answer key (`is_correct`, `correct_answer`, rubric, criteria, keywords)
 *   is read with the service role, and only after the caller's own RLS read
 *   of the exam succeeded. The student-readable surface never has to carry it (#840).
 * - Results are written with the service role. `save_exam_feedback` is not
 *   executable by `authenticated` or `anon` (it trusts every argument).
 */

/** Language the model writes feedback in, keyed by the student's interface locale (#725). */
const FEEDBACK_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
}

export const AI_PERSONAS = {
  professional_educator: {
    name: 'Professional Educator',
    description: 'Formal, academic tone with focus on learning outcomes',
    systemPrompt: 'You are a professional educator with years of teaching experience. Provide formal, academic feedback that focuses on learning outcomes and concept mastery.',
  },
  friendly_tutor: {
    name: 'Friendly Tutor',
    description: 'Warm, approachable tone with encouragement',
    systemPrompt: 'You are a friendly tutor who genuinely cares about student success. Use a warm, approachable tone and provide plenty of encouragement while still maintaining academic rigor.',
  },
  strict_professor: {
    name: 'Strict Professor',
    description: 'Direct, high-standard feedback',
    systemPrompt: 'You are a strict professor with high standards. Provide direct, no-nonsense feedback that pushes students to excellence. Be fair but challenging.',
  },
  supportive_mentor: {
    name: 'Supportive Mentor',
    description: 'Empathetic, growth-focused guidance',
    systemPrompt: 'You are a supportive mentor who focuses on student growth and development. Acknowledge effort, celebrate progress, and provide guidance for improvement with empathy.',
  },
} as const

export const FEEDBACK_TONES = {
  encouraging: 'Use positive, motivating language. Highlight what the student did well before addressing areas for improvement.',
  neutral: 'Maintain an objective, balanced tone. Focus on facts and clear explanations.',
  constructive: 'Focus on specific actionable feedback for improvement while being supportive.',
  challenging: 'Push the student to think deeper. Ask probing questions and encourage critical thinking.',
} as const

export const DETAIL_LEVELS = {
  brief: 'Provide concise, to-the-point feedback (1-2 sentences per question).',
  moderate: 'Provide balanced feedback with key points and examples (2-3 sentences per question).',
  detailed: 'Provide comprehensive feedback with thorough explanations (3-4 sentences per question).',
  comprehensive: 'Provide extensive feedback with detailed analysis, examples, and additional resources (4+ sentences per question).',
} as const

export type AIPersona = keyof typeof AI_PERSONAS
export type FeedbackTone = keyof typeof FEEDBACK_TONES
export type DetailLevel = keyof typeof DETAIL_LEVELS

/** `exam_submissions.review_status` values that mean "not graded yet". */
const UNGRADED_STATUSES = new Set<string | null>([null, 'pending'])

export interface QuestionFeedback {
  question_id: number
  student_answer: string
  is_correct: boolean
  points_earned: number
  points_possible: number
  feedback: string
  confidence: number
}

export type GradeExamOutcome =
  | {
      ok: true
      score: number
      overall_feedback: string
      question_feedback: Record<string, QuestionFeedback>
    }
  | { ok: false; status: 404 | 409 | 500; error: string }

interface GradeExamArgs {
  /** The caller's RLS-scoped client (cookie or Bearer). */
  supabase: SupabaseClient
  userId: string
  tenantId: string
  submissionId: number
  /** The exam the caller says this submission belongs to; must match. */
  examId: number
  /** Interface locale; feedback prose is written in it. */
  locale: string
}

interface KeyedQuestion {
  question_id: number
  question_text: string
  question_type: string
  points: number | null
  correct_answer: string | null
  grading_rubric: string | null
  ai_grading_criteria: string | null
  expected_keywords: string[] | null
  options: { option_id: number; option_text: string; is_correct: boolean | null }[]
}

export async function gradeExamSubmission(args: GradeExamArgs): Promise<GradeExamOutcome> {
  const startTime = Date.now()
  const { supabase, userId, tenantId, submissionId, examId, locale } = args
  const admin = createAdminClient()

  // 1. The submission is the caller's own, in this school, for this exam.
  const { data: submission } = await supabase
    .from('exam_submissions')
    .select('submission_id, exam_id, review_status')
    .eq('submission_id', submissionId)
    .eq('student_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!submission || submission.exam_id !== examId) {
    return { ok: false, status: 404, error: 'Submission not found' }
  }
  if (!UNGRADED_STATUSES.has(submission.review_status)) {
    return { ok: false, status: 409, error: 'Submission already graded' }
  }

  // 2. The caller can read the exam (entitlement, tenant, publish state — all RLS).
  const { data: exam } = await supabase
    .from('exams')
    .select('exam_id, title, description')
    .eq('exam_id', examId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!exam) return { ok: false, status: 404, error: 'Exam not found' }

  // 3. The key, now that the read above proved the caller may see this exam.
  const { data: questionRows, error: questionsError } = await admin
    .from('exam_questions')
    .select(
      `question_id, question_text, question_type, points, correct_answer,
       grading_rubric, ai_grading_criteria, expected_keywords,
       options:question_options (option_id, option_text, is_correct)`
    )
    .eq('exam_id', examId)
  if (questionsError) {
    console.error('Exam questions query failed:', questionsError)
    return { ok: false, status: 500, error: 'Failed to load exam' }
  }
  const questions = (questionRows ?? []) as unknown as KeyedQuestion[]

  // 4. What the student actually handed in.
  const { data: answerRows } = await supabase
    .from('exam_answers')
    .select('question_id, answer_text')
    .eq('submission_id', submissionId)
  const answers: Record<string, string> = {}
  for (const row of answerRows ?? []) {
    answers[row.question_id] = row.answer_text ?? ''
  }

  const totalPoints = questions.reduce((sum, q) => sum + (q.points || 10), 0)
  const percentOf = (feedback: Record<string, QuestionFeedback>) => {
    const earned = Object.values(feedback).reduce((sum, q) => sum + (q.points_earned || 0), 0)
    return totalPoints > 0 ? (earned / totalPoints) * 100 : 0
  }
  const save = (overall: string, score: number, feedback: Record<string, QuestionFeedback>, model: string) =>
    admin.rpc('save_exam_feedback', {
      p_submission_id: submissionId,
      p_exam_id: examId,
      p_student_id: userId,
      p_answers: answers,
      p_overall_feedback: overall,
      p_score: score,
      p_question_feedback: feedback,
      p_ai_model: model,
      p_processing_time_ms: Date.now() - startTime,
    })

  const freeTextQuestions = questions.filter((q) => q.question_type === 'free_text')
  const autoGradeQuestions = questions.filter((q) => q.question_type !== 'free_text')

  // 5. Closed questions are graded programmatically.
  const autoGradedScores: Record<string, QuestionFeedback> = {}
  for (const q of autoGradeQuestions) {
    const studentAnswer = answers[q.question_id]
    let isCorrect = false

    if (q.question_type === 'multiple_choice') {
      const correctOption = q.options.find((opt) => opt.is_correct)
      isCorrect = studentAnswer === correctOption?.option_id?.toString()
    } else if (q.question_type === 'true_false') {
      // Student answers 'true'/'false'. `correct_answer` wins when set,
      // otherwise the text of the option flagged correct.
      if (q.correct_answer) {
        isCorrect = studentAnswer?.toLowerCase() === q.correct_answer.toLowerCase()
      } else {
        const correctOption = q.options.find((opt) => opt.is_correct)
        if (correctOption) {
          isCorrect = studentAnswer?.toLowerCase() === correctOption.option_text?.toLowerCase()
        }
      }
    }

    const questionPoints = q.points || 10
    autoGradedScores[q.question_id] = {
      question_id: q.question_id,
      student_answer: studentAnswer || 'No answer provided',
      is_correct: isCorrect,
      points_earned: isCorrect ? questionPoints : 0,
      points_possible: questionPoints,
      feedback: isCorrect ? EXAM_FEEDBACK_CODES.correct : EXAM_FEEDBACK_CODES.incorrect,
      confidence: 1.0,
    }
  }

  if (freeTextQuestions.length === 0) {
    const score = percentOf(autoGradedScores)
    const { error } = await save(EXAM_FEEDBACK_CODES.graded, score, autoGradedScores, 'programmatic')
    if (error) {
      console.error('Failed to save exam feedback:', error)
      return { ok: false, status: 500, error: 'Failed to save grading results' }
    }
    return { ok: true, score, overall_feedback: EXAM_FEEDBACK_CODES.graded, question_feedback: autoGradedScores }
  }

  // 6. Free text: the teacher's AI config (staff-only table, read by exam id,
  // which step 2 already proved the caller may see — #674).
  const { data: aiConfig } = await admin
    .from('exam_ai_configs')
    .select('*')
    .eq('exam_id', examId)
    .maybeSingle()
  const config = aiConfig || {
    ai_grading_enabled: true,
    ai_persona: 'professional_educator',
    ai_feedback_tone: 'encouraging',
    ai_feedback_detail_level: 'detailed',
    ai_grading_prompt: null,
  }

  // Plan gate (#662): below Pro, free text waits for a teacher, the same as
  // a teacher who switched AI grading off.
  const aiGradingAllowed = await hasPlanFeature(tenantId, 'ai_grading')

  if (!config.ai_grading_enabled || !aiGradingAllowed) {
    // Free text is parked behind a status code that readers translate (#725).
    const pendingFeedback: Record<string, QuestionFeedback> = {}
    for (const q of freeTextQuestions) {
      pendingFeedback[q.question_id] = {
        question_id: q.question_id,
        student_answer: answers[q.question_id] || 'No answer provided',
        is_correct: false,
        points_earned: 0,
        points_possible: q.points || 10,
        feedback: EXAM_FEEDBACK_CODES.pendingTeacherReview,
        confidence: 0,
      }
    }
    const allFeedback = { ...autoGradedScores, ...pendingFeedback }
    // Scored from the closed questions only; the teacher scores the rest.
    const score = percentOf(autoGradedScores)
    const { error } = await save(EXAM_FEEDBACK_CODES.pendingTeacherReview, score, allFeedback, 'programmatic')
    if (error) {
      console.error('Failed to save exam feedback:', error)
      return { ok: false, status: 500, error: 'Failed to save grading results' }
    }

    // `save_exam_feedback` just stamped `ai_reviewed`. Flag the row for the
    // teacher queue so the student doesn't see "AI evaluated" for an answer nobody graded (#674).
    const { error: flagError } = await admin
      .from('exam_submissions')
      .update({ review_status: 'pending_teacher_review', requires_attention: true })
      .eq('submission_id', submissionId)
      .eq('student_id', userId)
    if (flagError) console.error('Failed to flag submission for teacher review:', flagError)

    return {
      ok: true,
      score,
      overall_feedback: EXAM_FEEDBACK_CODES.pendingTeacherReview,
      question_feedback: allFeedback,
    }
  }

  // 7. AI grading of the free-text answers.
  const feedbackLanguage = FEEDBACK_LANGUAGES[locale] ?? FEEDBACK_LANGUAGES.en
  const persona = AI_PERSONAS[config.ai_persona as AIPersona] || AI_PERSONAS.professional_educator
  const tone = FEEDBACK_TONES[config.ai_feedback_tone as FeedbackTone] || FEEDBACK_TONES.encouraging
  const detailLevel = DETAIL_LEVELS[config.ai_feedback_detail_level as DetailLevel] || DETAIL_LEVELS.detailed

  const questionsContext = freeTextQuestions
    .map((q) => {
      const studentAnswer = answers[q.question_id] || 'No answer provided'
      let questionContext = `
**Question ID: ${q.question_id}** (${q.points || 10} points)
Type: Free Text
Question: ${q.question_text}
Student Answer: ${studentAnswer}
`
      if (q.grading_rubric) questionContext += `\nGrading Rubric: ${q.grading_rubric}`
      if (q.ai_grading_criteria) questionContext += `\nGrading Criteria: ${q.ai_grading_criteria}`
      if (q.expected_keywords && q.expected_keywords.length > 0) {
        questionContext += `\nExpected Keywords: ${q.expected_keywords.join(', ')}`
      }
      return questionContext
    })
    .join('\n\n---\n\n')

  const aiPrompt = `${persona.systemPrompt}

${tone}

${detailLevel}

${config.ai_grading_prompt ? `\n**Teacher's Custom Instructions:**\n${config.ai_grading_prompt}\n` : ''}

**Exam Information:**
Title: ${exam.title}
${exam.description ? `Description: ${exam.description}` : ''}
Total Free-Text Questions: ${freeTextQuestions.length}
Total Questions: ${questions.length}

**Free-Text Questions and Student Answers:**
${questionsContext}

**Your Task:**
Evaluate each free-text answer carefully and provide detailed feedback. Return your evaluation in the following JSON format.
IMPORTANT: Use the exact "Question ID" number from each question header above (e.g., ${freeTextQuestions.map((q) => q.question_id).join(', ')}). Do NOT use sequential numbers like 1, 2, 3.

{
  "questions": [
    {
      "question_id": <exact Question ID number from above>,
      "student_answer": "<student's answer>",
      "is_correct": true/false,
      "points_earned": <points earned (can be partial)>,
      "points_possible": <total points>,
      "feedback": "<your detailed feedback>",
      "confidence": <0.0-1.0 confidence score>
    }
  ],
  "overall_feedback": "<overall assessment of free-text responses, ending with 1-2 reflective pointers>"
}

**Grading Guidelines for Free-Text Questions:**
- Evaluate based on rubric, criteria, and keyword presence provided for each question
- Award partial credit for partially correct answers (e.g., 6 out of 10 points)
- Consider accuracy, completeness, depth of understanding, and critical thinking
- Be fair but thorough in your evaluation
- Provide specific, actionable feedback explaining why points were awarded or deducted
- Acknowledge good points even in incomplete answers
- End "overall_feedback" with 1-2 reflective pointers instead of only listing errors: name where the misses cluster and give the student one concrete self-explanation task to do before retrying (e.g. "your misses cluster on X — before retrying, explain to yourself in one sentence how X differs from Y")
- Write ALL feedback ("feedback" and "overall_feedback") in ${feedbackLanguage}: it is the language of the student's interface, so use it even if the answer was written in another language
- Use the confidence score to indicate how certain you are about your grading (0.0-1.0)
- Always return valid JSON

Evaluate these free-text answers now:`

  const result = await propagateAttributes(
    { metadata: { examId: String(examId), submissionId: String(submissionId) } },
    () => generateText({
      model: AI_MODELS.grader,
      prompt: aiPrompt,
      experimental_telemetry: { functionId: 'exam-grading' },
    }),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiEvaluation: any
  try {
    const jsonMatch = result.text.match(/```json\s*([\s\S]*?)\s*```/) || result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    aiEvaluation = JSON.parse(jsonMatch[1] || jsonMatch[0])
  } catch {
    console.error('Failed to parse AI response:', result.text)
    return { ok: false, status: 500, error: 'Failed to parse AI grading response. Please try again.' }
  }
  if (!aiEvaluation.questions || !Array.isArray(aiEvaluation.questions)) {
    return { ok: false, status: 500, error: 'Invalid AI response format' }
  }

  // Only ids of this exam's free-text questions are accepted, and points are
  // clamped to what the question is worth: the model's output is not trusted
  // to stay inside the exam.
  const freeTextById = new Map(freeTextQuestions.map((q) => [String(q.question_id), q]))
  const aiScores: Record<string, QuestionFeedback> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const q of aiEvaluation.questions as any[]) {
    const question = freeTextById.get(String(q.question_id))
    if (!question) continue
    const possible = question.points || 10
    const earned = Math.max(0, Math.min(possible, Number(q.points_earned) || 0))
    aiScores[question.question_id] = {
      question_id: question.question_id,
      student_answer: answers[question.question_id] || 'No answer provided',
      is_correct: Boolean(q.is_correct),
      points_earned: earned,
      points_possible: possible,
      feedback: typeof q.feedback === 'string' ? q.feedback : '',
      confidence: typeof q.confidence === 'number' ? q.confidence : 0.8,
    }
  }

  const questionFeedback = { ...autoGradedScores, ...aiScores }
  const score = percentOf(questionFeedback)
  const overall = aiEvaluation.overall_feedback || EXAM_FEEDBACK_CODES.graded
  const { error: saveError } = await save(overall, score, questionFeedback, DEFAULT_MODEL_ID)
  if (saveError) {
    console.error('Failed to save exam feedback:', saveError)
    return { ok: false, status: 500, error: 'Failed to save grading results' }
  }

  return { ok: true, score, overall_feedback: overall, question_feedback: questionFeedback }
}
