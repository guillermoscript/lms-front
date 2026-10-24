'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/server'
import { hasOptions, planExamQuestionDiff, type OptionPlan } from '@/lib/exams/question-diff'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export interface ExamQuestionData {
  /** Set for a question already saved: it is updated in place, never re-created. */
  question_id?: number
  question_text: string
  question_type: 'multiple_choice' | 'true_false' | 'free_text'
  points_possible: number
  sequence: number
  ai_grading_criteria: string
  expected_keywords: string[]
  grading_rubric?: string
  options: {
    option_id?: number
    option_text: string
    is_correct: boolean
  }[]
}

export interface ExamFormData {
  title: string
  description: string
  image?: string | null
  duration: number
  sequence: number
  publish: boolean
  questions: ExamQuestionData[]
}

function validateExamData(data: ExamFormData) {
  if (!data.title?.trim()) throw new Error('Title is required')
  if (!data.duration || data.duration < 1) throw new Error('Duration must be at least 1 minute')
  if (!data.sequence || data.sequence < 1) throw new Error('Sequence must be at least 1')

  for (const [idx, q] of data.questions.entries()) {
    if (!q.question_text?.trim()) {
      throw new Error(`Question ${idx + 1} text is required`)
    }
    if (q.points_possible < 0) {
      throw new Error(`Question ${idx + 1} points must be >= 0`)
    }
    if (q.question_type === 'multiple_choice' || q.question_type === 'true_false') {
      if (!q.options || q.options.length < 2) {
        throw new Error(`Question ${idx + 1} must have at least 2 options`)
      }
      const correctCount = q.options.filter(o => o.is_correct).length
      if (correctCount !== 1) {
        throw new Error(`Question ${idx + 1} must have exactly 1 correct option`)
      }
    }
  }
}

type ServerClient = Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>

/** The `exam_questions` columns the builder writes; the split trigger moves the key ones into `exam_grading_secrets`. */
function questionRow(q: ExamQuestionData, sequence: number) {
  return {
    question_text: q.question_text.trim(),
    question_type: q.question_type,
    ai_grading_criteria: q.ai_grading_criteria || '',
    expected_keywords: q.expected_keywords || [],
    sequence,
  }
}

async function insertOptions(supabase: ServerClient, questionId: number, options: ExamQuestionData['options']) {
  if (options.length === 0) return
  const { error } = await supabase.from('question_options').insert(
    options.map((opt) => ({
      question_id: questionId,
      option_text: opt.option_text,
      is_correct: opt.is_correct,
    }))
  )
  if (error) throw error
}

async function insertQuestionsAndOptions(
  supabase: ServerClient,
  examId: number,
  questions: { sequence: number; question: ExamQuestionData }[]
) {
  for (const { sequence, question: q } of questions) {
    const { data: question, error: qError } = await supabase
      .from('exam_questions')
      .insert({ exam_id: examId, ...questionRow(q, sequence) })
      .select('question_id')
      .single()

    if (qError) throw qError

    if (hasOptions(q.question_type)) {
      await insertOptions(supabase, question.question_id, q.options)
    }
  }
}

async function applyOptionPlan(supabase: ServerClient, questionId: number, plan: OptionPlan) {
  if (plan.delete.length > 0) {
    const { error } = await supabase
      .from('question_options')
      .delete()
      .eq('question_id', questionId)
      .in('option_id', plan.delete)
    if (error) throw error
  }
  for (const opt of plan.update) {
    const { error } = await supabase
      .from('question_options')
      .update({ option_text: opt.option_text, is_correct: opt.is_correct })
      .eq('option_id', opt.option_id)
      .eq('question_id', questionId)
    if (error) throw error
  }
  await insertOptions(supabase, questionId, plan.insert)
}

export async function createExam(courseId: number, data: ExamFormData) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)
    validateExamData(data)

    const { data: newExam, error: insertError } = await ctx.supabase
      .from('exams')
      .insert({
        course_id: courseId,
        tenant_id: ctx.tenantId,
        title: data.title.trim(),
        description: data.description || null,
        image: data.image?.trim() || null,
        duration: data.duration,
        sequence: data.sequence,
        status: data.publish ? 'published' : 'draft',
        created_by: ctx.userId,
      })
      .select('exam_id')
      .single()

    if (insertError) throw insertError

    await insertQuestionsAndOptions(
      ctx.supabase,
      newExam.exam_id,
      data.questions.map((question, idx) => ({ sequence: idx + 1, question }))
    )

    await track(
      ANALYTICS_EVENTS.EXAM_CREATED,
      {
        exam_id: newExam.exam_id,
        course_id: courseId,
        question_count: data.questions.length,
        question_types: Array.from(new Set(data.questions.map((q) => q.question_type))),
        duration_minutes: data.duration,
        published: Boolean(data.publish),
      },
      { userId: ctx.userId, tenantId: ctx.tenantId, role: ctx.role }
    )

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)

    return { examId: newExam.exam_id }
  })
}

export async function updateExam(courseId: number, examId: number, data: ExamFormData) {
  return actionHandler(async () => {
    const ctx = await requireTeacherOrAdmin()
    await verifyCourseOwnership(ctx, courseId)
    validateExamData(data)

    // Verify exam belongs to this course and tenant
    const { data: existingExam } = await ctx.supabase
      .from('exams')
      .select('exam_id')
      .eq('exam_id', examId)
      .eq('course_id', courseId)
      .eq('tenant_id', ctx.tenantId)
      .single()

    if (!existingExam) throw new Error('Exam not found')

    // Plan the whole save before writing anything: kept questions and options
    // are updated in place so student answers, per-question scores, grading
    // secrets and grading tests (all keyed by question id) survive the edit.
    const { data: storedQuestions, error: storedError } = await ctx.supabase
      .from('exam_questions')
      .select('question_id, options:question_options(option_id)')
      .eq('exam_id', examId)

    if (storedError) throw storedError

    const plan = planExamQuestionDiff(storedQuestions ?? [], data.questions)

    // Deleting a question cascades to every student's answer to it, so a
    // question that has been answered can't be removed. Read with the admin
    // client: a row RLS hides from this teacher would still be deleted.
    if (plan.delete.length > 0) {
      const { data: answered, error: answeredError } = await createAdminClient()
        .from('exam_answers')
        .select('question_id')
        .in('question_id', plan.delete)
        .limit(1)

      if (answeredError) throw answeredError
      if (answered && answered.length > 0) {
        throw new Error('Students have already answered a question you removed, so it cannot be deleted. Reload the exam to restore it.')
      }
    }

    const { error: updateError } = await ctx.supabase
      .from('exams')
      .update({
        title: data.title.trim(),
        description: data.description || null,
        image: data.image?.trim() || null,
        duration: data.duration,
        sequence: data.sequence,
        status: data.publish ? 'published' : 'draft',
      })
      .eq('exam_id', examId)
      .eq('tenant_id', ctx.tenantId)

    if (updateError) throw updateError

    if (plan.delete.length > 0) {
      const { error: deleteError } = await ctx.supabase
        .from('exam_questions')
        .delete()
        .eq('exam_id', examId)
        .in('question_id', plan.delete)

      if (deleteError) throw deleteError
    }

    for (const kept of plan.update) {
      const { error } = await ctx.supabase
        .from('exam_questions')
        .update(questionRow(kept.question, kept.sequence))
        .eq('question_id', kept.question_id)
        .eq('exam_id', examId)

      if (error) throw error
      await applyOptionPlan(ctx.supabase, kept.question_id, kept.options)
    }

    await insertQuestionsAndOptions(ctx.supabase, examId, plan.insert)

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/exams/${examId}`)

    return { examId }
  })
}
