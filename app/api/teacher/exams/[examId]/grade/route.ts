import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateText, Output } from 'ai'
import { NextRequest } from 'next/server'
import z from 'zod'
import { track } from '@/lib/analytics/server'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

/**
 * `exams` has no `passing_score` column (see CLAUDE.md) — 70 is the documented
 * platform default and the only threshold `passed` can honestly mean.
 */
const DEFAULT_PASS_THRESHOLD = 70

export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { examId } = await params
  const { submission_id } = await req.json()

  // Validate exam belongs to tenant
  const { data: exam } = await supabase
    .from('exams')
    .select('exam_id, course_id, course:courses!inner(tenant_id)')
    .eq('exam_id', examId)
    .single()

  if (!exam || (exam as any).course?.tenant_id !== tenantId) {
    return Response.json({ error: 'Exam not found' }, { status: 404 })
  }

  // 1. Fetch submission with answers and questions
  const { data: submission, error } = await supabase
    .from('exam_submissions')
    .select(`
      *,
      exam:exams(*),
      answers:exam_answers(
        *,
        question:exam_questions(*)
      )
    `)
    .eq('submission_id', submission_id)
    .eq('exam_id', examId)
    .single()

  if (error || !submission) {
    return Response.json({ error: 'Submission not found' }, { status: 404 })
  }

  const gradingStartedAt = Date.now()
  let totalScore = 0
  let totalQuestions = submission.answers.length
  const feedbackItems = []

  // 2. Grade each free-text answer with AI
  for (const answer of submission.answers) {
    if (answer.question.question_type === 'free_text') {
      const result = await generateText({
        model: AI_MODELS.grader,
        prompt: PROMPTS.examGrader(answer.question.question_text, answer.answer_text),
        output: Output.object({
          schema: z.object({
            score: z.number(),
            feedback: z.string(),
            is_correct: z.boolean()
          })
        })
      })

      const grading = (result as any).object

      // Update answer with AI feedback
      await supabase
        .from('exam_answers')
        .update({
          is_correct: grading.is_correct,
          feedback: grading.feedback
        })
        .eq('answer_id', answer.answer_id)

      totalScore += grading.score
      feedbackItems.push({
        question: answer.question.question_text,
        score: grading.score,
        feedback: grading.feedback
      })
    } else {
      // Multiple choice / True-False already graded
      totalScore += answer.is_correct ? 100 : 0
    }
  }

  const averageScore = totalScore / totalQuestions

  // 3. Save overall score
  await supabase
    .from('exam_scores')
    .insert({
      submission_id: submission_id,
      student_id: submission.student_id,
      exam_id: submission.exam_id,
      score: averageScore,
      feedback: `AI Grading Summary:\n${feedbackItems.map(f => `- ${f.question}: ${f.score}/100 - ${f.feedback}`).join('\n')}`
    })

  // 4. Update submission status
  await supabase
    .from('exam_submissions')
    .update({
      review_status: 'ai_reviewed',
      ai_data: { feedbackItems }
    })
    .eq('submission_id', submission_id)

  // Attributed to the STUDENT, not the teacher who triggered the run — the
  // grade is an event in the learner's history, and a teacher batch-grading
  // thirty submissions would otherwise read as thirty events by one person.
  await track(
    ANALYTICS_EVENTS.EXAM_GRADED,
    {
      exam_id: submission.exam_id,
      submission_id,
      score: averageScore,
      passed: averageScore >= DEFAULT_PASS_THRESHOLD,
      graded_by: 'ai',
      question_count: totalQuestions,
      duration_ms: Date.now() - gradingStartedAt,
    },
    { userId: submission.student_id, tenantId }
  )

  return Response.json({ success: true, score: averageScore, feedback: feedbackItems })
}
