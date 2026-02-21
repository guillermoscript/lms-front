import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonSidebar } from '@/components/student/lesson-sidebar'
import { LessonContent } from './lesson-content'
import { IconRobot, IconMenu2, IconSparkles } from '@tabler/icons-react'
import { LessonNavigation } from './lesson-navigation'
import { LessonComments } from '@/components/student/lesson-comments'
import { LessonAIChat } from '@/components/student/lesson-ai-chat'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getTranslations } from 'next-intl/server'
import { getCurrentTenantId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
  const t = await getTranslations('components.lessons')
  const tenantId = await getCurrentTenantId()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  const { data: lessonData, error: lessonError } = await supabase
    .from('lessons')
    .select(`
      *,
      courses(*),
      lesson_comments(*,
        profiles(*),
        comment_reactions(*)
      ),
      lessons_ai_tasks(*),
      lessons_ai_task_messages(*),
      lesson_completions(lesson_id, user_id)
    `)
    .eq('id', parseInt(lessonId))
    .eq('tenant_id', tenantId)
    .eq('lessons_ai_task_messages.user_id', user.id)
    .eq('lesson_completions.user_id', user.id)
    .order('created_at', {
      ascending: true,
      referencedTable: 'lessons_ai_task_messages'
    })
    .single()

  if (lessonError || !lessonData) {
    notFound()
  }

  const lesson = lessonData;
  const course = lessonData.courses;
  const aiTask = Array.isArray(lessonData.lessons_ai_tasks)
    ? lessonData.lessons_ai_tasks?.[0]
    : lessonData.lessons_ai_tasks;

  const dbMessages = lessonData.lessons_ai_task_messages || [];
  const initialMessages = dbMessages.map((msg: any, index: number) => {
    const parts = [];

    if (msg.message) {
      parts.push({
        type: 'text',
        text: msg.message
      });
    }

    if (msg.tool_invocations) {
      const invocations = Array.isArray(msg.tool_invocations)
        ? msg.tool_invocations
        : [msg.tool_invocations];

      invocations.forEach((invocation: any) => {
        parts.push({
          type: 'tool-invocation',
          toolInvocation: invocation
        });
      });
    }

    return {
      id: msg.id.toString(),
      role: msg.sender,
      parts: parts,
      createdAt: msg.created_at
    };
  });

  const isCurrentLessonCompleted = lessonData.lesson_completions?.length > 0;

  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title, sequence')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .eq('tenant_id', tenantId)
    .order('sequence', { ascending: true })

  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)

  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])

  const sidebarLessons =
    allLessons?.map((l) => ({
      id: l.id,
      title: l.title,
      sequence: l.sequence,
      isCompleted: completedLessonIds.has(l.id),
    })) || []

  const currentIndex = allLessons?.findIndex((l) => l.id === lesson.id) ?? -1
  const prevLesson = currentIndex > 0 ? allLessons?.[currentIndex - 1] : null
  const nextLesson =
    currentIndex < (allLessons?.length ?? 0) - 1 ? allLessons?.[currentIndex + 1] : null

  return (
    <div className="flex h-screen bg-background overflow-hidden">
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
                {isCurrentLessonCompleted && (
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[9px] font-bold uppercase tracking-wider h-4 px-1.5">
                    Completed
                  </Badge>
                )}
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
                  <LessonSidebar
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

            {/* AI Task Section */}
            {aiTask && (
              <section className="space-y-5">
                <div className="rounded-2xl border-2 border-primary/10 bg-gradient-to-b from-primary/[0.04] to-transparent overflow-hidden">
                  {/* Task header */}
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

                  {/* Task description */}
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

                  {/* Chat */}
                  <div className="px-5 pb-5">
                    <LessonAIChat
                      lessonId={lesson.id}
                      taskDescription={aiTask.task_instructions}
                      isCompleted={isCurrentLessonCompleted}
                      initialMessages={initialMessages}
                      data-testid="lesson-ai-chat"
                    />
                  </div>
                </div>
              </section>
            )}

            {/* Comments Section */}
            <section className="border-t pt-10">
              <LessonComments lessonId={lesson.id} userId={user.id} />
            </section>
          </div>
        </div>

        {/* Navigation footer */}
        <LessonNavigation
          lessonId={lesson.id}
          courseId={parseInt(courseId)}
          isCompleted={isCurrentLessonCompleted}
          prevLessonId={prevLesson?.id}
          nextLessonId={nextLesson?.id}
        />
      </main>

      {/* Sidebar - Hidden on mobile, shown on md+ */}
      <div className="hidden md:block">
        <LessonSidebar
          courseId={parseInt(courseId)}
          courseTitle={course.title}
          lessons={sidebarLessons}
          currentLessonId={lesson.id}
        />
      </div>
    </div>
  )
}
