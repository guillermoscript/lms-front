'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/supabase/tenant'
import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

/**
 * AI Persona configurations for exam grading
 */
const AI_PERSONAS = {
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

/**
 * Feedback tone configurations
 */
const FEEDBACK_TONES = {
  encouraging: 'Use positive, motivating language. Highlight what the student did well before addressing areas for improvement.',
  neutral: 'Maintain an objective, balanced tone. Focus on facts and clear explanations.',
  constructive: 'Focus on specific actionable feedback for improvement while being supportive.',
  challenging: 'Push the student to think deeper. Ask probing questions and encourage critical thinking.',
} as const

/**
 * Detail level configurations
 */
const DETAIL_LEVELS = {
  brief: 'Provide concise, to-the-point feedback (1-2 sentences per question).',
  moderate: 'Provide balanced feedback with key points and examples (2-3 sentences per question).',
  detailed: 'Provide comprehensive feedback with thorough explanations (3-4 sentences per question).',
  comprehensive: 'Provide extensive feedback with detailed analysis, examples, and additional resources (4+ sentences per question).',
} as const

export type AIPersona = keyof typeof AI_PERSONAS
export type FeedbackTone = keyof typeof FEEDBACK_TONES
export type DetailLevel = keyof typeof DETAIL_LEVELS

interface GradeExamParams {
  examId: number
  submissionId: number
  answers: Record<string, string> // questionId -> answer
}

interface QuestionFeedback {
  question_id: number
  student_answer: string
  is_correct: boolean
  points_earned: number
  points_possible: number
  feedback: string
  confidence: number
}

interface ExamGradingResult {
  success: boolean
  score?: number
  overall_feedback?: string
  question_feedback?: Record<string, QuestionFeedback>
  error?: string
}

/**
 * Grade an exam submission using AI
 */
export async function gradeExamWithAI(
  params: GradeExamParams
): Promise<ExamGradingResult> {
  const startTime = Date.now()

  try {
    const supabase = await createClient()

    // Get authenticated user from middleware header (no extra network call)
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Unauthorized' }
    }

    // Get exam with questions
    const { data: exam, error: examError } = await supabase
      .from('exams')
      .select(
        `
        exam_id,
        title,
        description,
        passing_score,
        questions:exam_questions (
          question_id,
          question_text,
          question_type,
          points,
          correct_answer,
          grading_rubric,
          ai_grading_criteria,
          expected_keywords,
          options:question_options (
            option_id,
            option_text,
            is_correct
          )
        )
      `
      )
      .eq('exam_id', params.examId)
      .single()

    if (examError || !exam) {
      return { success: false, error: 'Exam not found' }
    }

    // Separate free-text questions from auto-gradable questions
    const freeTextQuestions = exam.questions.filter((q: any) => q.question_type === 'free_text')
    const autoGradeQuestions = exam.questions.filter((q: any) => q.question_type !== 'free_text')

    // Auto-grade non-free-text questions programmatically
    const autoGradedScores: Record<string, QuestionFeedback> = {}
    autoGradeQuestions.forEach((q: any) => {
      const studentAnswer = params.answers[q.question_id]
      let isCorrect = false
      let feedback = ''

      if (q.question_type === 'multiple_choice') {
        const correctOption = q.options.find((opt: any) => opt.is_correct)
        isCorrect = studentAnswer === correctOption?.option_id?.toString()
        feedback = isCorrect
          ? 'Correct answer!'
          : `Incorrect. The correct answer is: ${correctOption?.option_text}`
      } else if (q.question_type === 'true_false') {
        // true/false: student answers with 'true'/'false' string
        // Match against correct_answer field if set, otherwise use question_options
        if (q.correct_answer) {
          isCorrect = studentAnswer?.toLowerCase() === q.correct_answer.toLowerCase()
        } else {
          // Use question_options - find the correct option and check if its text matches
          const correctOption = q.options.find((opt: any) => opt.is_correct)
          if (correctOption) {
            isCorrect = studentAnswer?.toLowerCase() === correctOption.option_text?.toLowerCase()
          }
        }
        const correctAnswer = q.correct_answer || q.options.find((opt: any) => opt.is_correct)?.option_text || 'Unknown'
        feedback = isCorrect
          ? 'Correct!'
          : `Incorrect. The correct answer is: ${correctAnswer}`
      }

      const questionPoints = q.points || 10
      autoGradedScores[q.question_id] = {
        question_id: q.question_id,
        student_answer: studentAnswer || 'No answer provided',
        is_correct: isCorrect,
        points_earned: isCorrect ? questionPoints : 0,
        points_possible: questionPoints,
        feedback,
        confidence: 1.0, // 100% confidence for programmatic grading
      }
    })

    // If there are no free-text questions, skip AI grading
    if (freeTextQuestions.length === 0) {
      // Calculate total score
      const totalPoints = exam.questions.reduce((sum: number, q: any) => sum + (q.points || 10), 0)
      const earnedPoints = Object.values(autoGradedScores).reduce(
        (sum: number, q: any) => sum + (q.points_earned || 0),
        0
      )
      const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0

      // Save feedback to database
      const processingTime = Date.now() - startTime
      const { error: saveError } = await supabase.rpc('save_exam_feedback', {
        p_submission_id: params.submissionId,
        p_exam_id: params.examId,
        p_student_id: userId,
        p_answers: params.answers,
        p_overall_feedback: 'Exam graded successfully.',
        p_score: scorePercentage,
        p_question_feedback: autoGradedScores,
        p_ai_model: 'programmatic',
        p_processing_time_ms: processingTime,
      })

      if (saveError) {
        return { success: false, error: 'Failed to save grading results' }
      }

      return {
        success: true,
        score: scorePercentage,
        overall_feedback: 'Exam graded successfully.',
        question_feedback: autoGradedScores,
      }
    }

    // Get AI configuration for free-text grading
    const { data: aiConfig } = await supabase
      .from('exam_ai_configs')
      .select('*')
      .eq('exam_id', params.examId)
      .single()

    // Use config or sensible defaults (don't try to insert — student won't have RLS permission)
    const config = aiConfig || {
      ai_grading_enabled: true,
      ai_persona: 'professional_educator',
      ai_feedback_tone: 'encouraging',
      ai_feedback_detail_level: 'detailed',
      ai_grading_prompt: null,
    }

    // Check if AI grading is enabled for free-text questions
    if (!config.ai_grading_enabled) {
      // AI grading disabled — save auto-graded results only, mark free-text as pending teacher review
      const totalPoints = exam.questions.reduce((sum: number, q: any) => sum + (q.points || 10), 0)
      const earnedPoints = Object.values(autoGradedScores).reduce(
        (sum: number, q: any) => sum + (q.points_earned || 0),
        0
      )
      // Score only from auto-graded questions; free-text will be scored by teacher
      const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0

      // Add placeholder feedback for free-text questions
      const pendingFeedback: Record<string, QuestionFeedback> = {}
      freeTextQuestions.forEach((q: any) => {
        pendingFeedback[q.question_id] = {
          question_id: q.question_id,
          student_answer: params.answers[q.question_id] || 'No answer provided',
          is_correct: false,
          points_earned: 0,
          points_possible: q.points || 10,
          feedback: 'Pending teacher review.',
          confidence: 0,
        }
      })

      const allFeedback = { ...autoGradedScores, ...pendingFeedback }
      const processingTime = Date.now() - startTime
      await supabase.rpc('save_exam_feedback', {
        p_submission_id: params.submissionId,
        p_exam_id: params.examId,
        p_student_id: userId,
        p_answers: params.answers,
        p_overall_feedback: 'Multiple choice and true/false questions have been auto-graded. Free-text questions are pending teacher review.',
        p_score: scorePercentage,
        p_question_feedback: allFeedback,
        p_ai_model: 'programmatic',
        p_processing_time_ms: processingTime,
      })

      // Mark submission as needing teacher attention
      await supabase
        .from('exam_submissions')
        .update({ review_status: 'pending_teacher_review', requires_attention: true })
        .eq('submission_id', params.submissionId)

      return {
        success: true,
        score: scorePercentage,
        overall_feedback: 'Multiple choice and true/false questions have been auto-graded. Free-text questions are pending teacher review.',
        question_feedback: allFeedback,
      }
    }

    // Build AI grading prompt using config
    const persona = AI_PERSONAS[config.ai_persona as AIPersona] || AI_PERSONAS.professional_educator
    const tone = FEEDBACK_TONES[config.ai_feedback_tone as FeedbackTone] || FEEDBACK_TONES.encouraging
    const detailLevel = DETAIL_LEVELS[config.ai_feedback_detail_level as DetailLevel] || DETAIL_LEVELS.detailed

    // Build questions context for AI (only free-text questions)
    const questionsContext = freeTextQuestions
      .map((q: any, index: number) => {
        const studentAnswer = params.answers[q.question_id] || 'No answer provided'

        const qPoints = q.points || 10
        let questionContext = `
**Question ${index + 1}** (${qPoints} points)
Type: Free Text
Question: ${q.question_text}
Student Answer: ${studentAnswer}
`

        if (q.grading_rubric) {
          questionContext += `\nGrading Rubric: ${q.grading_rubric}`
        }
        if (q.ai_grading_criteria) {
          questionContext += `\nGrading Criteria: ${q.ai_grading_criteria}`
        }
        if (q.expected_keywords && q.expected_keywords.length > 0) {
          questionContext += `\nExpected Keywords: ${q.expected_keywords.join(', ')}`
        }

        return questionContext
      })
      .join('\n\n---\n\n')

    // Build the complete AI prompt
    const aiPrompt = `${persona.systemPrompt}

${tone}

${detailLevel}

${config.ai_grading_prompt ? `\n**Teacher's Custom Instructions:**\n${config.ai_grading_prompt}\n` : ''}

**Exam Information:**
Title: ${exam.title}
${exam.description ? `Description: ${exam.description}` : ''}
Total Free-Text Questions: ${freeTextQuestions.length}
Passing Score: ${exam.passing_score || 'Not specified'}

**Free-Text Questions and Student Answers:**
${questionsContext}

**Your Task:**
Evaluate each free-text answer carefully and provide detailed feedback. Return your evaluation in the following JSON format:

{
  "questions": [
    {
      "question_id": <question_id>,
      "student_answer": "<student's answer>",
      "is_correct": true/false,
      "points_earned": <points earned (can be partial)>,
      "points_possible": <total points>,
      "feedback": "<your detailed feedback>",
      "confidence": <0.0-1.0 confidence score>
    }
  ],
  "overall_feedback": "<overall assessment of free-text responses>"
}

**Grading Guidelines for Free-Text Questions:**
- Evaluate based on rubric, criteria, and keyword presence provided for each question
- Award partial credit for partially correct answers (e.g., 6 out of 10 points)
- Consider accuracy, completeness, depth of understanding, and critical thinking
- Be fair but thorough in your evaluation
- Provide specific, actionable feedback explaining why points were awarded or deducted
- Acknowledge good points even in incomplete answers
- Use the confidence score to indicate how certain you are about your grading (0.0-1.0)
- Always return valid JSON

Evaluate these free-text answers now:`

    // Call OpenAI model via AI SDK
    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: aiPrompt,
      temperature: 0.3, // Lower temperature for more consistent grading
      topP: 0.8,
    })

    const text = result.text

    // Parse AI response
    let aiEvaluation: any
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const jsonText = jsonMatch[1] || jsonMatch[0]
        aiEvaluation = JSON.parse(jsonText)
      } else {
        throw new Error('No JSON found in response')
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', text)
      return {
        success: false,
        error: 'Failed to parse AI grading response. Please try again.',
      }
    }

    // Validate AI response structure
    if (!aiEvaluation.questions || !Array.isArray(aiEvaluation.questions)) {
      return {
        success: false,
        error: 'Invalid AI response format',
      }
    }

    // Merge AI scores with auto-graded scores
    const aiScores: Record<string, QuestionFeedback> = {}
    aiEvaluation.questions.forEach((q: any) => {
      aiScores[q.question_id] = {
        question_id: q.question_id,
        student_answer: q.student_answer,
        is_correct: q.is_correct,
        points_earned: q.points_earned,
        points_possible: q.points_possible,
        feedback: q.feedback,
        confidence: q.confidence || 0.8,
      }
    })

    // Combine all scores (auto-graded + AI-graded)
    const questionFeedback = { ...autoGradedScores, ...aiScores }

    // Calculate total score from all questions
    const totalPoints = exam.questions.reduce((sum: number, q: any) => sum + (q.points || 10), 0)
    const earnedPoints = Object.values(questionFeedback).reduce(
      (sum: number, q: any) => sum + (q.points_earned || 0),
      0
    )
    const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0

    // Save feedback to database
    const processingTime = Date.now() - startTime
    const { error: saveError } = await supabase.rpc('save_exam_feedback', {
      p_submission_id: params.submissionId,
      p_exam_id: params.examId,
      p_student_id: userId,
      p_answers: params.answers,
      p_overall_feedback: aiEvaluation.overall_feedback || 'Exam graded successfully.',
      p_score: scorePercentage,
      p_question_feedback: questionFeedback,
      p_ai_model: 'gpt-4o-mini',
      p_processing_time_ms: processingTime,
    })

    if (saveError) {
      console.error('Failed to save exam feedback:', saveError)
      return {
        success: false,
        error: 'Failed to save grading results',
      }
    }

    return {
      success: true,
      score: scorePercentage,
      overall_feedback: aiEvaluation.overall_feedback,
      question_feedback: questionFeedback,
    }
  } catch (error) {
    console.error('Error grading exam:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to grade exam',
    }
  }
}

/**
 * Update exam AI configuration (teacher only)
 */
export async function updateExamAIConfig(params: {
  examId: number
  aiGradingEnabled: boolean
  aiGradingPrompt?: string
  aiPersona?: AIPersona
  aiFeedbackTone?: FeedbackTone
  aiFeedbackDetailLevel?: DetailLevel
}) {
  try {
    const supabase = await createClient()

    // Get authenticated user from middleware header (no extra network call)
    const userId = await getCurrentUserId()
    if (!userId) {
      return { success: false, error: 'Unauthorized' }
    }

    // Verify user is teacher/admin and owns the course
    const { data: exam } = await supabase
      .from('exams')
      .select('id, course:courses(id, author_id)')
      .eq('id', params.examId)
      .single()

    if (!exam) {
      return { success: false, error: 'Exam not found' }
    }

    // Check if user is course author or admin
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)

    const isAdmin = roles?.some((r) => r.role === 'admin')
    const isCourseAuthor = (exam.course as any).author_id === userId

    if (!isAdmin && !isCourseAuthor) {
      return { success: false, error: 'Unauthorized' }
    }

    // Update or insert exam AI configuration
    const { error: upsertError } = await supabase
      .from('exam_ai_configs')
      .upsert({
        exam_id: params.examId,
        ai_grading_enabled: params.aiGradingEnabled,
        ai_grading_prompt: params.aiGradingPrompt,
        ai_persona: params.aiPersona,
        ai_feedback_tone: params.aiFeedbackTone,
        ai_feedback_detail_level: params.aiFeedbackDetailLevel,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'exam_id'
      })

    if (upsertError) {
      return { success: false, error: 'Failed to update configuration' }
    }

    return { success: true }
  } catch (error) {
    console.error('Error updating exam AI config:', error)
    return { success: false, error: 'Failed to update configuration' }
  }
}

/**
 * Get available AI personas, tones, and detail levels for UI
 */
export async function getAIConfigOptions() {
  return {
    personas: Object.entries(AI_PERSONAS).map(([key, value]) => ({
      value: key,
      label: value.name,
      description: value.description,
    })),
    tones: Object.entries(FEEDBACK_TONES).map(([key, value]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      description: value,
    })),
    detailLevels: Object.entries(DETAIL_LEVELS).map(([key, value]) => ({
      value: key,
      label: key.charAt(0).toUpperCase() + key.slice(1),
      description: value,
    })),
  }
}
