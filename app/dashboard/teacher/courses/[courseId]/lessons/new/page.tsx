import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonEditor } from '@/components/teacher/lesson-editor'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewLessonPage({ params }: PageProps) {
  const { courseId } = await params
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

  // Get the next sequence number
  const { data: lessons } = await supabase
    .from('lessons')
    .select('sequence')
    .eq('course_id', parseInt(courseId))
    .order('sequence', { ascending: false })
    .limit(1)

  const nextSequence = (lessons?.[0]?.sequence || 0) + 1

  return (
    <div className="min-h-screen bg-background">
      <LessonEditor
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialSequence={nextSequence}
      />
    </div>
  )
}
