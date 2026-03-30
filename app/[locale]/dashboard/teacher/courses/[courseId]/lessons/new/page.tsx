import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
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

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewLessonPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) return notFound()

  // Verify course ownership
  const { data: course } = await supabase
    .from('courses')
    .select('course_id, title')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!course) return notFound()

  // Get the next sequence number
  const { data: lessons } = await supabase
    .from('lessons')
    .select('sequence')
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
    .order('sequence', { ascending: false })
    .limit(1)

  const nextSequence = (lessons?.[0]?.sequence || 0) + 1

  return (
    <div className="min-h-screen bg-background">
      <LessonEditorTour userId={userId} />
      <LessonEditor
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        initialSequence={nextSequence}
      />
    </div>
  )
}
