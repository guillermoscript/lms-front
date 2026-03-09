import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonEditor } from '@/components/teacher/lesson-editor'
import { getCurrentTenantId } from '@/lib/supabase/tenant'
import { LessonEditorTour } from '@/components/tours/lesson-editor-tour'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function EditLessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
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

  // Get lesson
  const { data: lesson } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', parseInt(lessonId))
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .single()

  if (!lesson) {
    notFound()
  }

  return (
    <div className="min-h-screen bg-background">
      <LessonEditorTour userId={user.id} />
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
          ai_task_description: lesson.ai_task_description || null,
          ai_task_instructions: lesson.ai_task_instructions || null,
        }}
      />
    </div>
  )
}
