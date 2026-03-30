import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const ExamBuilder = dynamic(
  () => import('@/components/teacher/exam-builder').then(m => m.ExamBuilder),
  {
    loading: () => (
      <div className="mx-auto max-w-4xl p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-9 w-32" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    ),
  }
)
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function NewExamPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
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
  const { data: exams } = await supabase
    .from('exams')
    .select('sequence')
    .eq('course_id', parseInt(courseId))
    .eq('tenant_id', tenantId)
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
