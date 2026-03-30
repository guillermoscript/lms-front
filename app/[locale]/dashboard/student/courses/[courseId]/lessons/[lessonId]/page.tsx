import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { LessonSidebar } from '@/components/student/lesson-sidebar'
import { LessonContent } from './lesson-content'
import { LessonResources } from '@/components/student/lesson-resources'
import { IconMenu2, IconSparkles, IconLock } from '@tabler/icons-react'
import { LessonNavigation } from './lesson-navigation'
import { LessonComments } from '@/components/student/lesson-comments'
import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'

const LessonAIChat = dynamic(
  () => import('@/components/student/lesson-ai-chat').then(m => m.LessonAIChat),
  {
    loading: () => (
      <div className="space-y-3 p-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-10 w-full" />
      </div>
    ),
  }
)
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { LessonCompletionBadge } from '@/components/student/lesson-completion-badge'
import { AnimatedSection } from '@/components/student/animated-section'
import { getTranslations } from 'next-intl/server'
import {getCurrentTenantId, getCurrentUserId } from '@/lib/supabase/tenant'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()
  const t = await getTranslations('components.lessons')
  const tenantId = await getCurrentTenantId()

  const userId = await getCurrentUserId()
  if (!userId) {
    redirect('/auth/login')
  }

  const { data: lessonData, error: lessonError } = await supabase
    .from('lessons')
    .select(`
      id, title, sequence, content, video_url, embed_code, course_id,
      courses(title, require_sequential_completion),
      lesson_comments(*,
        profiles(*),
        comment_reactions(*)
      ),
      lessons_ai_tasks(task_instructions),
      lessons_ai_task_messages(id, message, sender, created_at),
      lesson_completions(lesson_id, user_id)
    `)
    .eq('id', parseInt(lessonId))
    .eq('tenant_id', tenantId)
    .eq('lessons_ai_task_messages.user_id', userId)
    .eq('lesson_completions.user_id', userId)
    .order('created_at', {
      ascending: true,
      referencedTable: 'lessons_ai_task_messages'
    })
    .single()

  if (lessonError) {
    console.error('Error fetching lesson:', lessonError)
  }
  if (lessonError || !lessonData) {
    notFound()
  }

  const lesson = lessonData;
  const course = lessonData.courses as unknown as { title: string; require_sequential_completion: boolean | null };
  const aiTask = Array.isArray(lessonData.lessons_ai_tasks)
    ? lessonData.lessons_ai_tasks?.[0]
    : lessonData.lessons_ai_tasks;

  const dbMessages = lessonData.lessons_ai_task_messages || [];
  const initialMessages = dbMessages.map((msg: any) => {
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

  // Transform server-fetched comments into the shape LessonComments expects
  const initialComments = (() => {
    const rawComments = lessonData.lesson_comments || []
    if (rawComments.length === 0) return []

    type RawComment = {
      id: number
      content: string
      created_at: string
      user_id: string
      parent_comment_id: number | null
      profiles: { id: string; full_name: string | null; username: string | null; avatar_url: string | null } | null
      comment_reactions: { comment_id: number; user_id: string; reaction_type: string }[]
    }

    const allComments = (rawComments as RawComment[]).map((c) => ({
      id: c.id,
      content: c.content,
      created_at: c.created_at,
      user_id: c.user_id,
      parent_comment_id: c.parent_comment_id,
      user: c.profiles
        ? { id: c.profiles.id, full_name: c.profiles.full_name, username: c.profiles.username, avatar_url: c.profiles.avatar_url }
        : { id: c.user_id, full_name: 'Unknown', username: null, avatar_url: null },
      reactions: (c.comment_reactions || []).map((r) => ({
        user_id: r.user_id,
        reaction_type: r.reaction_type as 'like' | 'dislike' | 'boring' | 'funny',
      })),
      replies: [] as any[],
    }))

    // Build tree structure
    const rootComments = allComments.filter((c) => c.parent_comment_id === null)
    const replyMap = new Map<number, typeof allComments>()
    allComments.forEach((c) => {
      if (c.parent_comment_id) {
        const replies = replyMap.get(c.parent_comment_id) || []
        replies.push(c)
        replyMap.set(c.parent_comment_id, replies)
      }
    })

    const attachReplies = (comment: (typeof allComments)[0]): (typeof allComments)[0] => {
      const replies = replyMap.get(comment.id) || []
      const sortedReplies = replies.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      return { ...comment, replies: sortedReplies.map(attachReplies) }
    }

    return rootComments
      .map(attachReplies)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  const [{ data: allLessons }, { data: completions }, { data: lessonResources }] = await Promise.all([
    supabase
      .from('lessons')
      .select('id, title, sequence')
      .eq('course_id', parseInt(courseId))
      .eq('status', 'published')
      .eq('tenant_id', tenantId)
      .order('sequence', { ascending: true }),
    supabase
      .from('lesson_completions')
      .select('lesson_id')
      .eq('user_id', userId),
    supabase
      .from('lesson_resources')
      .select('id, file_name, file_size, mime_type')
      .eq('lesson_id', parseInt(lessonId))
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true }),
  ])

  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])

  // Sequential prerequisite check
  const requireSequential = course.require_sequential_completion === true
  let isLocked = false
  let prevLessonForUnlock: { id: number; title: string } | null = null

  if (requireSequential && allLessons) {
    const currentIdx = allLessons.findIndex((l) => l.id === lesson.id)
    if (currentIdx > 0) {
      const prevL = allLessons[currentIdx - 1]
      if (!completedLessonIds.has(prevL.id)) {
        isLocked = true
        prevLessonForUnlock = prevL
      }
    }
  }

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

  // Locked lesson — show locked state
  if (isLocked && prevLessonForUnlock) {
    return (
      <div className="flex h-screen bg-background overflow-hidden">
        <main className="flex flex-1 flex-col overflow-hidden w-full">
          <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-3 py-2.5 sm:px-4 sm:py-3 md:px-6">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                    {t('lessonIndex', { count: lesson.sequence })}
                  </span>
                </div>
                <h1 className="text-base sm:text-lg md:text-xl font-bold tracking-tight line-clamp-1">{lesson.title}</h1>
              </div>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6 max-w-md">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <IconLock className="h-8 w-8 text-muted-foreground" />
              </div>
              <h2 className="text-lg font-semibold mb-2">{t('lessonLocked')}</h2>
              <p className="text-sm text-muted-foreground mb-6">{t('completePreviousFirst')}</p>
              <Link href={`/dashboard/student/courses/${courseId}/lessons/${prevLessonForUnlock.id}`}>
                <Button size="sm" className="gap-2">
                  {prevLessonForUnlock.title}
                </Button>
              </Link>
            </div>
          </div>
        </main>
        <div className="hidden md:block">
          <LessonSidebar
            courseId={parseInt(courseId)}
            courseTitle={course.title}
            lessons={sidebarLessons}
            currentLessonId={lesson.id}
            requireSequentialCompletion={requireSequential}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden w-full">
        {/* Lesson header */}
        <header className="shrink-0 border-b bg-card/80 backdrop-blur-sm px-3 py-2.5 sm:px-4 sm:py-3 md:px-6">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                  {t('lessonIndex', { count: lesson.sequence })}
                </span>
                {isCurrentLessonCompleted && <LessonCompletionBadge />}
              </div>
              <h1 className="text-base sm:text-lg md:text-xl font-bold tracking-tight line-clamp-1">{lesson.title}</h1>
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
                    requireSequentialCompletion={requireSequential}
                  />
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-3 py-5 sm:px-4 sm:py-8 md:px-6 md:py-10 space-y-8 sm:space-y-10">
            <LessonContent
              content={lesson.content}
              videoUrl={lesson.video_url}
              embedCode={lesson.embed_code}
            />

            {/* Lesson Resources */}
            {lessonResources && lessonResources.length > 0 && (
              <AnimatedSection delay={0.1}>
                <LessonResources resources={lessonResources} />
              </AnimatedSection>
            )}

            {/* AI Task Section — breaks out of content padding on mobile for more width */}
            {aiTask && (
              <AnimatedSection delay={0.15}>
              <section className="-mx-3 sm:mx-0">
                <div className="sm:rounded-2xl border-y sm:border-2 border-primary/10 bg-gradient-to-b from-primary/[0.04] to-transparent overflow-hidden">
                  {/* Task header */}
                  <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-primary/10 bg-primary/[0.03]">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                        <IconSparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-foreground">{t('aiTutorTitle')}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{t('aiTutorDescription')}</p>
                      </div>
                    </div>
                  </div>

                  {/* Task description */}
                  <div className="px-3 py-3 sm:px-5 sm:py-4">
                    <div className="bg-card border rounded-xl p-3 sm:p-4 shadow-sm">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 mb-1.5 sm:mb-2">
                        {t('currentTask')}
                      </h4>
                      <p className="text-sm text-foreground leading-relaxed">
                        {aiTask.task_instructions}
                      </p>
                    </div>
                  </div>

                  {/* Chat */}
                  <div className="sm:px-5 sm:pb-5">
                    <LessonAIChat
                      lessonId={lesson.id}
                      taskDescription={aiTask.task_instructions}
                      isCompleted={isCurrentLessonCompleted}
                      initialMessages={initialMessages}
                    />
                  </div>
                </div>
              </section>
              </AnimatedSection>
            )}

            {/* Comments Section */}
            <section className="border-t pt-10">
              <LessonComments lessonId={lesson.id} userId={userId} tenantId={tenantId} initialComments={initialComments} />
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
          tenantId={tenantId}
          requireSequentialCompletion={requireSequential}
        />
      </main>

      {/* Sidebar - Hidden on mobile, shown on md+ */}
      <div className="hidden md:block">
        <LessonSidebar
          courseId={parseInt(courseId)}
          courseTitle={course.title}
          lessons={sidebarLessons}
          currentLessonId={lesson.id}
          requireSequentialCompletion={requireSequential}
        />
      </div>
    </div>
  )
}
