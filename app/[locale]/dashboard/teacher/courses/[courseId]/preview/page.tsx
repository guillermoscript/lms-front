import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { LessonExplorer } from '@/components/student/lesson-explorer'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IconBarbell,
  IconPlayerPlay,
  IconFileText,
} from '@tabler/icons-react'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { PageShell } from '@/components/dashboard/page-shell'
import { PreviewBanner } from '@/components/teacher/preview-banner'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CoursePreviewPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()
  const t = await getTranslations('courseDetails')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const numericCourseId = parseInt(courseId)

  // Verify the teacher owns this course (instead of enrollment check)
  const { data: course, error } = await supabase
    .from('courses')
    .select('course_id, title, description, thumbnail_url, author_id')
    .eq('course_id', numericCourseId)
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (error) {
    console.error('Error fetching course for preview:', error)
  }
  if (error || !course) {
    notFound()
  }

  // Fetch all remaining data in parallel
  const [{ data: authorData }, { data: lessons }, { data: exams }, { data: exercises }] =
    await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url').eq('id', course.author_id).single(),
      supabase
        .from('lessons')
        .select('id, title, sequence, description')
        .eq('course_id', numericCourseId)
        .eq('status', 'published')
        .eq('tenant_id', tenantId)
        .order('sequence', { ascending: true }),
      supabase
        .from('exams')
        .select('exam_id')
        .eq('course_id', numericCourseId)
        .eq('status', 'published')
        .eq('tenant_id', tenantId),
      supabase
        .from('exercises')
        .select('id')
        .eq('course_id', numericCourseId)
        .eq('status', 'published')
        .eq('tenant_id', tenantId),
    ])

  const authorProfile = authorData
  const totalLessons = lessons?.length || 0
  const firstLesson = lessons?.[0]
  const examCount = exams?.length || 0
  const exerciseCount = exercises?.length || 0

  return (
    <div className="flex-1">
      <PreviewBanner courseId={courseId} />

      {/* Header with course info */}
      <header className="border-b bg-card">
        <div className="mx-auto w-full max-w-5xl px-6 py-6 lg:px-8 lg:py-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-start lg:gap-10">
            {/* Thumbnail */}
            {course.thumbnail_url && (
              <div className="aspect-video w-full shrink-0 overflow-hidden rounded-2xl shadow-lg border md:w-80 lg:w-96">
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <h1 className="text-2xl font-black md:text-3xl lg:text-4xl tracking-tight leading-tight line-clamp-3">
                  {course.title}
                </h1>

                {authorProfile && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm font-medium">{t('instructor')}</span>
                    <span className="text-sm font-bold text-foreground">
                      {authorProfile.full_name || t('unknownInstructor')}
                    </span>
                  </div>
                )}
              </div>

              {course.description && (
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed line-clamp-3 md:line-clamp-none">
                  {course.description}
                </p>
              )}

              {/* Progress bar - static at 0% for preview */}
              <div className="pt-2 space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-2xl font-black text-brand-text">0%</span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('courseProgress')}</p>
                  </div>
                  <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md text-muted-foreground">
                    {t('lessonsCount', { count: '0/' + totalLessons })}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted border p-[2px]">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out"
                    style={{ width: '0%' }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {firstLesson && (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview/lessons/${firstLesson.id}`} className="flex-1">
                    <Button size="lg" className="w-full h-12 md:h-14 text-lg font-bold shadow-md hover:shadow-lg transition-all">
                      <IconPlayerPlay className="mr-2 h-6 w-6 fill-current" />
                      {t('startNow')}
                    </Button>
                  </Link>
                )}
                {exerciseCount > 0 && (
                  <Button variant="outline" size="lg" className="flex-1 h-12 md:h-14 text-lg font-bold border-2 cursor-default opacity-70" disabled>
                    <IconBarbell className="mr-2 h-6 w-6" />
                    {t('exercises', { count: exerciseCount })}
                  </Button>
                )}
                {examCount > 0 && (
                  <Button variant="outline" size="lg" className="flex-1 h-12 md:h-14 text-lg font-bold border-2 cursor-default opacity-70" disabled>
                    <IconFileText className="mr-2 h-6 w-6" />
                    {t('exams', { count: examCount })}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Lessons list */}
      <PageShell variant="default" className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-black tracking-tight">{t('curriculum')}</h2>
          <Badge variant="outline" className="font-bold border-2">
            {t('lessonsCount', { count: totalLessons })}
          </Badge>
        </div>

        <LessonExplorer
          courseId={courseId}
          previewBase={`/dashboard/teacher/courses/${courseId}/preview/lessons`}
          lessons={(lessons ?? []).map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            sequence: l.sequence ?? 0,
            completed: false,
          }))}
        />
      </PageShell>
    </div>
  )
}
