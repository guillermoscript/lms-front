'use server'

import { actionHandler, requireTeacherOrAdmin, verifyCourseOwnership } from '@/lib/actions/utils'
import { revalidatePath } from 'next/cache'

export interface ExamQuestionData {
  question_text: string
  question_type: 'multiple_choice' | 'true_false' | 'free_text'
  points_possible: number
  sequence: number
  ai_grading_criteria: string
  expected_keywords: string[]
  grading_rubric?: string
  options: {
    option_text: string
    is_correct: boolean
  }[]
}

export interface ExamFormData {
  title: string
  description: string
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

async function insertQuestionsAndOptions(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  examId: number,
  questions: ExamQuestionData[]
) {
  for (const q of questions) {
    const { data: question, error: qError } = await supabase
      .from('exam_questions')
      .insert({
        exam_id: examId,
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        ai_grading_criteria: q.ai_grading_criteria || '',
        expected_keywords: q.expected_keywords || [],
      })
      .select('question_id')
      .single()

    if (qError) throw qError

    if (
      (q.question_type === 'multiple_choice' || q.question_type === 'true_false') &&
      q.options.length > 0
    ) {
      const { error: optError } = await supabase.from('question_options').insert(
        q.options.map((opt) => ({
          question_id: question.question_id,
          option_text: opt.option_text,
          is_correct: opt.is_correct,
        }))
      )
      if (optError) throw optError
    }
  }
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
        duration: data.duration,
        sequence: data.sequence,
        status: data.publish ? 'published' : 'draft',
        created_by: ctx.userId,
      })
      .select('exam_id')
      .single()

    if (insertError) throw insertError

    await insertQuestionsAndOptions(ctx.supabase, newExam.exam_id, data.questions)

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

    const { error: updateError } = await ctx.supabase
      .from('exams')
      .update({
        title: data.title.trim(),
        description: data.description || null,
        duration: data.duration,
        sequence: data.sequence,
        status: data.publish ? 'published' : 'draft',
      })
      .eq('exam_id', examId)
      .eq('tenant_id', ctx.tenantId)

    if (updateError) throw updateError

    // Delete all existing questions (cascades to question_options)
    const { error: deleteError } = await ctx.supabase
      .from('exam_questions')
      .delete()
      .eq('exam_id', examId)

    if (deleteError) throw deleteError

    // Re-insert all questions and options
    await insertQuestionsAndOptions(ctx.supabase, examId, data.questions)

    revalidatePath(`/dashboard/teacher/courses/${courseId}`)
    revalidatePath(`/dashboard/teacher/courses/${courseId}/exams/${examId}`)

    return { examId }
  })
}
