import { createClient } from '@/lib/supabase/server'
import { AI_MODELS } from '@/lib/ai/config'
import { PROMPTS } from '@/lib/ai/prompts'
import { generateText, Output } from 'ai'
import { NextRequest } from 'next/server'
import z from 'zod'

export async function POST(req: NextRequest, { params }: { params: Promise<{ examId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return new Response('Unauthorized', { status: 401 })

  const { examId } = await params
  const { submission_id } = await req.json()

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
    .single()

  if (error || !submission) {
    return Response.json({ error: 'Submission not found' }, { status: 404 })
  }

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

  return Response.json({ success: true, score: averageScore, feedback: feedbackItems })
}
