import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonEditor } from '@/components/teacher/lesson-editor'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function EditLessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
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

  // Get lesson
  const { data: lesson } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', parseInt(lessonId))
    .eq('course_id', parseInt(courseId))
    .single()

  if (!lesson) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <LessonEditor
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialSequence={lesson.sequence}
        initialData={{
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          content: lesson.content,
          video_url: lesson.video_url,
          sequence: lesson.sequence,
          status: lesson.status as 'draft' | 'published' | 'archived',
        }}
      />
    </div>
  )
}
