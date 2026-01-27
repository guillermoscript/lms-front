import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ExamTaker } from './exam-taker'

interface PageProps {
  params: Promise<{ courseId: string; examId: string }>
}

export default async function TakeExamPage({ params }: PageProps) {
  const { courseId, examId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', user.id)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'active')
    .single()

  if (!enrollment) {
    redirect('/dashboard/student')
  }

  // Check if user already submitted this exam
  const { data: existingSubmission } = await supabase
    .from('exam_submissions')
    .select('submission_id')
    .eq('exam_id', parseInt(examId))
    .eq('student_id', user.id)
    .single()

  if (existingSubmission) {
    redirect(`/dashboard/student/courses/${courseId}/exams/${examId}/review`)
  }

  // Get exam details
  const { data: exam } = await supabase
    .from('exams')
    .select(`
      exam_id,
      title,
      description,
      duration
    `)
    .eq('exam_id', parseInt(examId))
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .single()

  if (!exam) {
    notFound()
  }

  // Get questions with options
  const { data: questions } = await supabase
    .from('exam_questions')
    .select(`
      question_id,
      question_text,
      question_type,
      question_options (
        option_id,
        option_text
      )
    `)
    .eq('exam_id', parseInt(examId))
    .order('question_id', { ascending: true })

  // Format questions for the client component
  const formattedQuestions = questions?.map(q => ({
    id: q.question_id,
    text: q.question_text,
    type: q.question_type as 'multiple_choice' | 'true_false' | 'free_text',
    options: q.question_options?.map(o => ({
      id: o.option_id,
      text: o.option_text,
    })) || [],
  })) || []

  return (
    <ExamTaker
      examId={exam.exam_id}
      courseId={parseInt(courseId)}
      title={exam.title}
      description={exam.description}
      duration={exam.duration}
      questions={formattedQuestions}
    />
  )
}
