import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ExamBuilder } from '@/components/teacher/exam-builder'

interface PageProps {
  params: Promise<{ courseId: string; examId: string }>
}

export default async function EditExamPage({ params }: PageProps) {
  const { courseId, examId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', user.id)
    .single()

  if (!course) {
    notFound()
  }

  // Get exam
  const { data: exam } = await supabase
    .from('exams')
    .select('*')
    .eq('exam_id', parseInt(examId))
    .eq('course_id', parseInt(courseId))
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
        option_text,
        is_correct
      )
    `)
    .eq('exam_id', parseInt(examId))
    .order('question_id', { ascending: true })

  // Format questions for the component
  const formattedQuestions = questions?.map((q) => ({
    id: q.question_id.toString(),
    text: q.question_text,
    type: q.question_type as 'multiple_choice' | 'true_false' | 'free_text',
    options:
      q.question_options?.map((o: any) => ({
        id: o.option_id.toString(),
        text: o.option_text,
        is_correct: o.is_correct,
      })) || [],
  })) || []

  return (
    <div className="min-h-screen bg-background">
      <ExamBuilder
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialSequence={exam.sequence}
        initialData={{
          exam_id: exam.exam_id,
          title: exam.title,
          description: exam.description,
          duration: exam.duration,
          sequence: exam.sequence,
          status: exam.status as 'draft' | 'published' | 'archived',
          questions: formattedQuestions,
        }}
      />
    </div>
  )
}
