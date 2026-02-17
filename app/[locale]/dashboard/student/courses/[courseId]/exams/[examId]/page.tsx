import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ExamTaker } from './exam-taker'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string; examId: string }>
}

export default async function TakeExamPage({ params }: PageProps) {
  const { courseId, examId } = await params
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

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
    .eq('tenant_id', tenantId)
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
    .eq('tenant_id', tenantId)
    .single()

  if (existingSubmission) {
    redirect(`/dashboard/student/courses/${courseId}/exams/${examId}/result`)
  }

  // Get exam details with questions and options in one query as requested
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .select(`
      exam_id,
      course_id,
      title,
      description,
      duration,
      status,
      exam_date,
      courses (
        course_id,
        title
      ),
      exam_questions!exam_questions_exam_id_fkey (
        question_id,
        exam_id,
        question_text,
        question_type,
        question_options (
          option_id,
          question_id,
          option_text,
          is_correct
        )
      )
    `)
    .eq('exam_id', parseInt(examId))
    .eq('status', 'published')
    .eq('tenant_id', tenantId)
    .order('question_id', { foreignTable: 'exam_questions', ascending: true })
    .single()

  console.log('🔍 Exam query result:', {
    examId,
    error: examError,
    hasExam: !!exam,
    questionsCount: exam?.exam_questions?.length || 0,
    examKeys: exam ? Object.keys(exam) : [],
    examData: exam ? {
      exam_id: exam.exam_id,
      title: exam.title,
      status: exam.status,
      hasQuestionsKey: 'exam_questions' in exam,
      questionsType: typeof exam.exam_questions,
      questionsIsArray: Array.isArray(exam.exam_questions),
      questionsPreview: exam.exam_questions
    } : null
  })

  if (examError || !exam) {
    console.error('❌ Exam not found or error:', examError)
    notFound()
  }

  // Format questions for the client component
  const formattedQuestions = (exam.exam_questions || []).map((q: any) => ({
    id: q.question_id,
    text: q.question_text,
    type: q.question_type as 'multiple_choice' | 'true_false' | 'free_text',
    options: (q.question_options || []).map((o: any) => ({
      id: o.option_id,
      text: o.option_text,
    })),
  }))

  console.log('✅ Formatted questions:', formattedQuestions.length, 'questions')

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
