import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { LessonSidebar } from '@/components/student/lesson-sidebar'
import { LessonContent } from './lesson-content'
import { LessonNavigation } from './lesson-navigation'

interface PageProps {
  params: Promise<{ courseId: string; lessonId: string }>
}

export default async function LessonPage({ params }: PageProps) {
  const { courseId, lessonId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Verify enrollment
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('user_id', user.id)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'active')
    .single()

  if (!enrollment) {
    redirect('/dashboard/student')
  }

  // Get course title
  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('course_id', parseInt(courseId))
    .single()

  if (!course) {
    notFound()
  }

  // Get current lesson
  const { data: lesson, error } = await supabase
    .from('lessons')
    .select('id, title, content, video_url, embed_code, sequence, description')
    .eq('id', parseInt(lessonId))
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .single()

  if (error || !lesson) {
    notFound()
  }

  // Get all lessons for sidebar
  const { data: allLessons } = await supabase
    .from('lessons')
    .select('id, title, sequence')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .order('sequence', { ascending: true })

  // Get completed lessons for this user
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id')
    .eq('user_id', user.id)

  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])
  const isCurrentLessonCompleted = completedLessonIds.has(lesson.id)

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
          <div className="mx-auto max-w-4xl px-6 py-8">
            <LessonContent
              content={lesson.content}
              videoUrl={lesson.video_url}
              embedCode={lesson.embed_code}
            />
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
