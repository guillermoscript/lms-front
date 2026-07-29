import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const LessonEditor = dynamic(
  () => import('@/components/teacher/lesson-editor').then(m => m.LessonEditor),
  {
    loading: () => (
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  }
)
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { LessonEditorTour } from '@/components/tours/lesson-editor-tour'
import { getUiState } from '@/lib/supabase/ui-state'
import { isTourCompleted, areToursEnabled } from '@/lib/ui-state-keys'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function EditLessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) {
    notFound()
  }

  // Get lesson and resources in parallel
  const [{ data: lesson }, { data: resources }, uiState] = await Promise.all([
    supabase
      .from('lessons')
      // The AI task lives in lessons_ai_tasks — that is what the student runtime
      // reads and what the editor writes. The lessons.ai_task_* columns are
      // legacy and only ever populated by a version restore.
      .select('*, lessons_ai_tasks(task_instructions, system_prompt)')
      .eq('id', parseInt(lessonId))
      .eq('course_id', parseInt(courseId))
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('lesson_resources')
      .select('id, file_name, file_size, mime_type')
      .eq('lesson_id', parseInt(lessonId))
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true }),
    getUiState(userId),
  ])

  if (!lesson) {
    notFound()
  }

  const aiTask = Array.isArray(lesson.lessons_ai_tasks)
    ? lesson.lessons_ai_tasks[0]
    : lesson.lessons_ai_tasks

  return (
    <div className="min-h-screen bg-background">
      <LessonEditorTour
        userId={userId}
        completed={isTourCompleted(uiState, 'lesson-editor')}
        toursEnabled={areToursEnabled(uiState)}
      />
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
          publish_at: lesson.publish_at || null,
          // Deliberately not falling back to lessons.ai_task_* here: those
          // columns can hold a task the student runtime no longer serves, and
          // showing it would tell the teacher a removed task is still live.
          ai_task_description: aiTask?.task_instructions || null,
          ai_task_instructions: aiTask?.system_prompt || null,
          is_preview: lesson.is_preview ?? null,
          resources: resources || [],
        }}
      />
    </div>
  )
}
