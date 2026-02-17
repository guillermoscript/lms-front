import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { ExamBuilder } from '@/components/teacher/exam-builder'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string; examId: string }>
}

export default async function EditExamPage({ params }: PageProps) {
  const { courseId, examId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')
  const tenantId = await getCurrentTenantId()

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
    .eq('tenant_id', tenantId)
    .single()

  if (!course) {
    notFound()
  }

  // Fetch exam data with questions and options
  const { data: exam } = await supabase
    .from('exams')
    .select(`
      *,
      questions:exam_questions(
        *,
        options:question_options(*)
      )
    `)
    .eq('exam_id', parseInt(examId))
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!exam) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <ExamBuilder
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialData={exam}
      />
    </div>
  )
}
