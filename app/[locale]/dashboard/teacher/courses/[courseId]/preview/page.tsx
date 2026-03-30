import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconBarbell,
  IconBook,
  IconClock,
  IconPlayerPlay,
  IconFileText,
} from '@tabler/icons-react'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { PreviewBanner } from '@/components/teacher/preview-banner'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CoursePreviewPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = createAdminClient()
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
    <div className="min-h-screen bg-background">
      <PreviewBanner courseId={courseId} />

      {/* Header with course info */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 sm:px-6 lg:px-8">
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
                    <span className="text-2xl font-black text-primary">0%</span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('courseProgress')}</p>
                  </div>
                  <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md text-muted-foreground">
                    {t('lessonsCount', { count: '0/' + totalLessons })}
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted border p-[2px]">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    style={{ width: '0%' }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {firstLesson && (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview/lessons/${firstLesson.id}`} className="flex-1">
                    <Button size="lg" className="w-full h-12 md:h-14 text-lg font-bold rounded-xl shadow-md hover:shadow-lg transition-all">
                      <IconPlayerPlay className="mr-2 h-6 w-6 fill-current" />
                      {t('startNow')}
                    </Button>
                  </Link>
                )}
                {exerciseCount > 0 && (
                  <Button variant="outline" size="lg" className="flex-1 h-12 md:h-14 text-lg font-bold rounded-xl border-2 cursor-default opacity-70" disabled>
                    <IconBarbell className="mr-2 h-6 w-6" />
                    {t('exercises', { count: exerciseCount })}
                  </Button>
                )}
                {examCount > 0 && (
                  <Button variant="outline" size="lg" className="flex-1 h-12 md:h-14 text-lg font-bold rounded-xl border-2 cursor-default opacity-70" disabled>
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
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black tracking-tight">{t('curriculum')}</h2>
          <Badge variant="outline" className="font-bold border-2">
            {t('lessonsCount', { count: totalLessons })}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {lessons?.map((lesson) => (
            <Link
              key={lesson.id}
              href={`/dashboard/teacher/courses/${courseId}/preview/lessons/${lesson.id}`}
              className="group"
            >
              <Card className="transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-1 rounded-2xl overflow-hidden border-2 border-transparent bg-muted/30">
                <CardContent className="flex items-center gap-4 p-5 md:p-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary shadow-sm border transition-colors">
                    <span className="text-lg font-black">
                      {lesson.sequence}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg group-hover:text-primary transition-colors truncate">
                      {lesson.title}
                    </h3>
                    {lesson.description ? (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                        {lesson.description}
                      </p>
                    ) : (
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          <IconClock size={12} />
                          {t('mins', { count: 15 })}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                          <IconBook size={12} />
                          {t('videoText')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="hidden sm:block">
                    <Button variant="ghost" size="sm" className="font-bold text-primary group-hover:bg-primary group-hover:text-white rounded-lg">
                      {t('study')}
                    </Button>
                  </div>
                  <div className="sm:hidden">
                    <IconPlayerPlay className="h-5 w-5 text-primary transition-transform group-hover:scale-110" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}

          {(!lessons || lessons.length === 0) && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <IconBook className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                {t('noLessons')}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
