import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import { LessonContent } from '@/app/[locale]/dashboard/student/courses/[courseId]/lessons/[lessonId]/lesson-content'
import { IconMenu2, IconSparkles, IconArrowLeft, IconArrowRight } from '@tabler/icons-react'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'
import { PreviewBanner } from '@/components/teacher/preview-banner'
import { PreviewLessonSidebar } from './preview-lesson-sidebar'
import Link from 'next/link'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPreviewPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = createAdminClient()
  const t = await getTranslations('components.lessons')
  const tNav = await getTranslations('components.lessonNavigation')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  // Verify teacher owns this course
  const { data: courseCheck } = await supabase
    .from('courses')
    .select('course_id')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', userId)
    .eq('tenant_id', tenantId)
    .single()

  if (!courseCheck) {
    notFound()
  }

  // Fetch lesson data and all published lessons in parallel
  const [{ data: lessonData, error: lessonError }, { data: allLessons }] = await Promise.all([
    supabase
      .from('lessons')
      .select('*, courses(title), lessons_ai_tasks(*)')
      .eq('id', parseInt(lessonId))
      .eq('tenant_id', tenantId)
      .single(),
    supabase
      .from('lessons')
      .select('id, title, sequence')
      .eq('course_id', parseInt(courseId))
      .eq('status', 'published')
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
  ])

  if (lessonError) {
    console.error('Error fetching lesson for preview:', lessonError)
  }
  if (lessonError || !lessonData) {
    notFound()
  }

  const lesson = lessonData
  const course = lessonData.courses
  const aiTask = Array.isArray(lessonData.lessons_ai_tasks)
    ? lessonData.lessons_ai_tasks?.[0]
    : lessonData.lessons_ai_tasks

  const sidebarLessons =
    allLessons?.map((l) => ({
      id: l.id,
      title: l.title,
      sequence: l.sequence,
    })) || []

  const currentIndex = allLessons?.findIndex((l) => l.id === lesson.id) ?? -1
  const prevLesson = currentIndex > 0 ? allLessons?.[currentIndex - 1] : null
  const nextLesson =
    currentIndex < (allLessons?.length ?? 0) - 1 ? allLessons?.[currentIndex + 1] : null

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <PreviewBanner courseId={courseId} />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <main className="flex flex-1 flex-col overflow-hidden w-full">
          {/* Lesson header */}
          <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-4 py-3 md:px-6">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {t('lessonIndex', { count: lesson.sequence })}
                  </span>
                </div>
                <h1 className="text-lg md:text-xl font-bold tracking-tight line-clamp-1">{lesson.title}</h1>
              </div>

              {/* Mobile Sidebar Toggle */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger
                    render={
                      <Button variant="ghost" size="icon" className="h-9 w-9">
                        <IconMenu2 className="h-5 w-5" />
                      </Button>
                    }
                  />
                  <SheetContent side="right" className="p-0 w-80">
                    <SheetHeader className="sr-only">
                      <SheetTitle>{t('sidebarTitle')}</SheetTitle>
                      <SheetDescription>{t('sidebarDescription')}</SheetDescription>
                    </SheetHeader>
                    <PreviewLessonSidebar
                      courseId={parseInt(courseId)}
                      courseTitle={course.title}
                      lessons={sidebarLessons}
                      currentLessonId={lesson.id}
                    />
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </header>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-10 space-y-10">
              <LessonContent
                content={lesson.content}
                videoUrl={lesson.video_url}
                embedCode={lesson.embed_code}
              />

              {/* AI Task Section - read-only preview */}
              {aiTask && (
                <section className="space-y-5">
                  <div className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.04] to-transparent overflow-hidden">
                    <div className="px-5 py-4 border-b border-primary/10 bg-primary/[0.03]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                          <IconSparkles className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-base text-foreground">{t('aiTutorTitle')}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">{t('aiTutorDescription')}</p>
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-4">
                      <div className="bg-card border rounded-xl p-4 shadow-sm">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-2">
                          {t('currentTask')}
                        </h4>
                        <p className="text-sm text-foreground leading-relaxed">
                          {aiTask.task_instructions}
                        </p>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Read-only navigation footer */}
          <footer className="shrink-0 border-t bg-card/80 backdrop-blur-sm px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3 max-w-4xl mx-auto">
              <div className="w-32">
                {prevLesson ? (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview/lessons/${prevLesson.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                      <IconArrowLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">{tNav('previous')}</span>
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview`}>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                      <IconArrowLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">{tNav('backToCourse')}</span>
                    </Button>
                  </Link>
                )}
              </div>

              {/* No mark-as-complete in preview */}
              <div />

              <div className="w-32 flex justify-end">
                {nextLesson ? (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview/lessons/${nextLesson.id}`}>
                    <Button size="sm" className="gap-1.5">
                      <span className="hidden sm:inline">{tNav('next')}</span>
                      <IconArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/dashboard/teacher/courses/${courseId}/preview`}>
                    <Button size="sm" className="gap-1.5">
                      <span className="hidden sm:inline">{tNav('finishCourse')}</span>
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </footer>
        </main>

        {/* Sidebar - Hidden on mobile */}
        <div className="hidden md:block">
          <PreviewLessonSidebar
            courseId={parseInt(courseId)}
            courseTitle={course.title}
            lessons={sidebarLessons}
            currentLessonId={lesson.id}
          />
        </div>
      </div>
    </div>
  )
}
