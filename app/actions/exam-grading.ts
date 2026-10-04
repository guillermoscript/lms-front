'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId, getCurrentTenantId } from '@/lib/supabase/tenant'
import { isPlanFeatureError, planFeatureErrorMessage, requirePlanFeature } from '@/lib/plans/server'
import { getLocale } from 'next-intl/server'
import {
  AI_PERSONAS,
  DETAIL_LEVELS,
  FEEDBACK_TONES,
  gradeExamSubmission,
  type AIPersona,
  type DetailLevel,
  type FeedbackTone,
  type QuestionFeedback,
} from '@/lib/exams/grade'

/**
 * Best-effort request locale. `getLocale()` throws outside a request scope;
 * an unknown locale falls back to English.
 */
async function requestLocale(): Promise<string> {
  try {
    return await getLocale()
  } catch {
    return 'en'
  }
}

interface ExamGradingResult {
  success: boolean
  score?: number
  overall_feedback?: string
  question_feedback?: Record<string, QuestionFeedback>
  error?: string
}

/**
 * Grade the caller's own exam submission. The grading itself lives in
 * `lib/exams/grade.ts`, shared with `POST /api/exams/[examId]/grade` (#839).
 * The answers are read from `exam_answers`, not taken from the caller.
 */
export async function gradeExamWithAI(params: {
  examId: number
  submissionId: number
}): Promise<ExamGradingResult> {
  try {
    const userId = await getCurrentUserId()
    if (!userId) return { success: false, error: 'Unauthorized' }

    const outcome = await gradeExamSubmission({
      supabase: await createClient(),
      userId,
      tenantId: await getCurrentTenantId(),
      submissionId: params.submissionId,
      examId: params.examId,
      locale: await requestLocale(),
    })
    if (!outcome.ok) return { success: false, error: outcome.error }
    return {
      success: true,
      score: outcome.score,
      overall_feedback: outcome.overall_feedback,
      question_feedback: outcome.question_feedback,
    }
  } catch (error) {
    console.error('Error grading exam:', error)
    try {
      const Sentry = await import('@sentry/nextjs')
      Sentry.captureException(error, { extra: { examId: params.examId, submissionId: params.submissionId } })
    } catch {}
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

    // Turning AI grading ON is the gated act (#662); switching it off or
    // editing the persona/tone while it stays off is always allowed.
    if (params.aiGradingEnabled) {
      try {
        await requirePlanFeature(await getCurrentTenantId(), 'ai_grading')
      } catch (err) {
        if (isPlanFeatureError(err)) return { success: false, error: planFeatureErrorMessage(err) }
        throw err
      }
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
