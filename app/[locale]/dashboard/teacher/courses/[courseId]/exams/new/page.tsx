import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect, notFound } from 'next/navigation'
import { ExamBuilder } from '@/components/teacher/exam-builder'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewExamPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('dashboard.teacher.manageCourse')

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

  // Get the next sequence number
  const { data: exams } = await supabase
    .from('exams')
    .select('sequence')
    .eq('course_id', parseInt(courseId))
    .order('sequence', { ascending: false })
    .limit(1)

  const nextSequence = (exams?.[0]?.sequence || 0) + 1

  return (
    <div className="min-h-screen bg-background">
      <ExamBuilder
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialData={{ sequence: nextSequence }}
      />
    </div>
  )
}
