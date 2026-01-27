import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  IconArrowLeft,
  IconBook,
  IconCheck,
  IconCircle,
  IconClock,
  IconPlayerPlay,
} from '@tabler/icons-react'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseOverviewPage({ params }: PageProps) {
  const { courseId } = await params
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

  // Get course with lessons
  const { data: course, error } = await supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      author:profiles!courses_author_id_fkey (
        full_name,
        avatar_url
      )
    `)
    .eq('course_id', parseInt(courseId))
    .single()

  if (error || !course) {
    notFound()
  }

  // Get lessons
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, sequence, description')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .order('sequence', { ascending: true })

  // Get completed lessons
  const { data: completions } = await supabase
    .from('lesson_completions')
    .select('lesson_id')
    .eq('user_id', user.id)

  const completedLessonIds = new Set(completions?.map((c) => c.lesson_id) || [])
  const totalLessons = lessons?.length || 0
  const completedCount = lessons?.filter((l) => completedLessonIds.has(l.id)).length || 0
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0

  // Find next lesson to continue
  const nextLesson = lessons?.find((l) => !completedLessonIds.has(l.id)) || lessons?.[0]

  return (
    <div className="min-h-screen bg-background">
      {/* Header with course info */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/student"
            className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <IconArrowLeft className="h-4 w-4" />
            Back to My Learning
          </Link>

          <div className="flex flex-col gap-6 md:flex-row md:items-start">
            {/* Thumbnail */}
            {course.thumbnail_url && (
              <div className="aspect-video w-full shrink-0 overflow-hidden rounded-lg md:w-64">
                <img
                  src={course.thumbnail_url}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
              </div>
            )}

            <div className="flex-1">
              <h1 className="text-2xl font-bold md:text-3xl">{course.title}</h1>

              {course.author && (
                <p className="mt-2 text-muted-foreground">
                  By {(course.author as any).full_name || 'Unknown Instructor'}
                </p>
              )}

              {course.description && (
                <p className="mt-4 text-muted-foreground line-clamp-3">
                  {course.description}
                </p>
              )}

              {/* Progress bar */}
              <div className="mt-6 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{progressPercent}% complete</span>
                  <span className="text-muted-foreground">
                    {completedCount}/{totalLessons} lessons
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Continue button */}
              {nextLesson && (
                <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLesson.id}`}>
                  <Button className="mt-6" size="lg">
                    <IconPlayerPlay className="mr-2 h-5 w-5" />
                    {completedCount > 0 ? 'Continue Learning' : 'Start Course'}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Lessons list */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-xl font-semibold">Course Content</h2>

        <div className="space-y-3">
          {lessons?.map((lesson) => {
            const isCompleted = completedLessonIds.has(lesson.id)

            return (
              <Link
                key={lesson.id}
                href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
              >
                <Card className="transition-all hover:border-primary/50 hover:shadow-sm">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        isCompleted ? 'bg-green-500/10' : 'bg-muted'
                      }`}
                    >
                      {isCompleted ? (
                        <IconCheck className="h-5 w-5 text-green-500" />
                      ) : (
                        <span className="text-sm font-medium text-muted-foreground">
                          {lesson.sequence}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">{lesson.title}</h3>
                      {lesson.description && (
                        <p className="mt-1 text-sm text-muted-foreground line-clamp-1">
                          {lesson.description}
                        </p>
                      )}
                    </div>

                    {isCompleted && (
                      <Badge variant="secondary" className="shrink-0">
                        Completed
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            )
          })}

          {(!lessons || lessons.length === 0) && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <IconBook className="mx-auto h-10 w-10 text-muted-foreground" />
              <p className="mt-4 text-muted-foreground">
                No lessons available yet.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
