import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonSidebar } from '@/components/student/lesson-sidebar'
import { LessonContent } from './lesson-content'
import { IconRobot, IconCheck } from '@tabler/icons-react'
import { LessonNavigation } from './lesson-navigation'
import { LessonComments } from '@/components/student/lesson-comments'
import { LessonAIChat } from '@/components/student/lesson-ai-chat'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Debug logs
  console.log("LessonPage params:", { courseId, lessonId });
  console.log("User:", user?.id);

  if (!user) {
    console.log("No user, redirecting to login");
    redirect('/auth/login')
  }

  // Consolidated query as requested
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
    .eq('lessons_ai_task_messages.user_id', user.id)
    .eq('lesson_completions.user_id', user.id)
    .single()

  console.log("Lesson Data:", lessonData ? "Found" : "Not Found", "Error:", lessonError);

  if (lessonError || !lessonData) {
    console.log("Lesson not found or error:", lessonError);
    notFound()
  }

  const lesson = lessonData;
  const course = lessonData.courses;
  const aiTask = lessonData.lessons_ai_tasks?.[0]; // It's a one-to-one mapping in the table, but Select returns array
  const initialMessages = lessonData.lessons_ai_task_messages || [];
  const isCurrentLessonCompleted = lessonData.lesson_completions?.length > 0;

  // Get all lessons for sidebar
  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title, sequence')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .order('sequence', { ascending: true })

  // Get completed lessons for this user (for sidebar highlights)
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id')
    .eq('user_id', user.id)

  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])

  // Format lessons for sidebar
  const sidebarLessons =
    allLessons?.map((l) => ({
      id: l.id,
      title: l.title,
      sequence: l.sequence,
      isCompleted: completedLessonIds.has(l.id),
    })) || []

  // Find prev/next lessons
  const currentIndex = allLessons?.findIndex((l) => l.id === lesson.id) ?? -1
  const prevLesson = currentIndex > 0 ? allLessons?.[currentIndex - 1] : null
  const nextLesson =
    currentIndex < (allLessons?.length ?? 0) - 1 ? allLessons?.[currentIndex + 1] : null

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <LessonSidebar
        courseId={parseInt(courseId)}
        courseTitle={course.title}
        lessons={sidebarLessons}
        currentLessonId={lesson.id}
      />

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Lesson header */}
        <header className="shrink-0 border-b bg-card px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Lesson {lesson.sequence}
              </p>
              <h1 className="text-xl font-bold">{lesson.title}</h1>
            </div>
          </div>
        </header>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
            <LessonContent
              content={lesson.content}
              videoUrl={lesson.video_url}
              embedCode={lesson.embed_code}
            />

            {/* AI Task Section */}
            {aiTask && (
              <div className="space-y-4">
                <div className="bg-primary/5 border border-primary/20 rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <IconRobot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-foreground">AI Tutor Session</h3>
                      <p className="text-sm text-muted-foreground">Complete the following task to finish this lesson</p>
                    </div>
                  </div>

                  <div className="bg-card border rounded-lg p-4 shadow-sm mb-6">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Current Task</h4>
                    <p className="text-foreground leading-relaxed">
                      {aiTask.task_instructions}
                    </p>
                  </div>

                  <LessonAIChat
                    lessonId={lesson.id}
                    taskDescription={aiTask.task_instructions}
                    isCompleted={isCurrentLessonCompleted}
                    initialMessages={initialMessages}
                  />
                </div>
              </div>
            )}

            {/* Comments Section */}
            <LessonComments lessonId={lesson.id} userId={user.id} />
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
    </div>
  )
}
