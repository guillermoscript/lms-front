import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  IconArrowLeft,
  IconBarbell,
  IconBook,
  IconCheck,
  IconCircle,
  IconClock,
  IconPlayerPlay,
  IconFileText,
} from '@tabler/icons-react'
import { CourseReviews } from '@/components/student/course-reviews'

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

  // Get course
  const { data: course, error } = await supabase
    .from('courses')
    .select(`
      course_id,
      title,
      description,
      thumbnail_url,
      author_id
    `)
    .eq('course_id', parseInt(courseId))
    .single()

  // Get author profile separately
  let authorProfile = null
  if (course && course.author_id) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', course.author_id)
      .single()
    authorProfile = data
  }

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

  // Get exams count
  const { data: exams } = await supabase
    .from('exams')
    .select('exam_id')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')

  const examCount = exams?.length || 0

  // Get exercises count
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')

  const exerciseCount = exercises?.length || 0

  // Check if user has already reviewed this course
  const { data: userReview } = await supabase
    .from('reviews')
    .select('review_id')
    .eq('course_id', parseInt(courseId))
    .eq('user_id', user.id)
    .single()

  const userHasReviewed = !!userReview

  return (
    <div className="min-h-screen bg-background">
      {/* Header with course info */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 md:py-8 sm:px-6 lg:px-8">
          <Link
            href="/dashboard/student"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <IconArrowLeft className="h-4 w-4" />
            Back to My Learning
          </Link>

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
                <h1 className="text-2xl font-black md:text-3xl lg:text-4xl tracking-tight leading-tight">
                  {course.title}
                </h1>

                {authorProfile && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm font-medium">Instructor:</span>
                    <span className="text-sm font-bold text-foreground">
                      {authorProfile.full_name || 'Unknown Instructor'}
                    </span>
                  </div>
                )}
              </div>

              {course.description && (
                <p className="text-sm md:text-base text-muted-foreground leading-relaxed line-clamp-3 md:line-clamp-none">
                  {course.description}
                </p>
              )}

              {/* Progress bar */}
              <div className="pt-2 space-y-3">
                <div className="flex justify-between items-end">
                  <div className="space-y-1">
                    <span className="text-2xl font-black text-primary">{progressPercent}%</span>
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course Progress</p>
                  </div>
                  <span className="text-xs font-bold bg-muted px-2 py-1 rounded-md text-muted-foreground">
                    {completedCount}/{totalLessons} LESSONS
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted border p-[2px]">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                {nextLesson && (
                  <Link href={`/dashboard/student/courses/${courseId}/lessons/${nextLesson.id}`} className="flex-1">
                    <Button size="lg" className="w-full h-12 md:h-14 text-lg font-bold rounded-xl shadow-md hover:shadow-lg transition-all">
                      <IconPlayerPlay className="mr-2 h-6 w-6 fill-current" />
                      {completedCount > 0 ? 'Continue' : 'Start Now'}
                    </Button>
                  </Link>
                )}
                {exerciseCount > 0 && (
                  <Link href={`/dashboard/student/courses/${courseId}/exercises`} className="flex-1">
                    <Button variant="outline" size="lg" className="w-full h-12 md:h-14 text-lg font-bold rounded-xl border-2">
                      <IconBarbell className="mr-2 h-6 w-6" />
                      Exercises ({exerciseCount})
                    </Button>
                  </Link>
                )}
                {examCount > 0 && (
                  <Link href={`/dashboard/student/courses/${courseId}/exams`} className="flex-1">
                    <Button variant="outline" size="lg" className="w-full h-12 md:h-14 text-lg font-bold rounded-xl border-2">
                      <IconFileText className="mr-2 h-6 w-6" />
                      Exams ({examCount})
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Lessons list */}
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-black tracking-tight">Curriculum</h2>
          <Badge variant="outline" className="font-bold border-2">
            {totalLessons} LESSONS
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {lessons?.map((lesson) => {
            const isCompleted = completedLessonIds.has(lesson.id)

            return (
              <Link
                key={lesson.id}
                href={`/dashboard/student/courses/${courseId}/lessons/${lesson.id}`}
                className="group"
              >
                <Card className="transition-all hover:border-primary/50 hover:shadow-md hover:-translate-y-1 rounded-2xl overflow-hidden border-2 border-transparent bg-muted/30">
                  <CardContent className="flex items-center gap-4 p-5 md:p-6">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isCompleted 
                        ? 'bg-green-500/20 text-green-500' 
                        : 'bg-background text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary shadow-sm border'
                      }`}
                    >
                      {isCompleted ? (
                        <IconCheck className="h-6 w-6" />
                      ) : (
                        <span className="text-lg font-black">
                          {lesson.sequence}
                        </span>
                      )}
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
                             15 MIN
                           </span>
                           <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                             <IconBook size={12} />
                             VIDEO + TEXT
                           </span>
                        </div>
                      )}
                    </div>

                    <div className="hidden sm:block">
                      {isCompleted ? (
                        <Badge className="bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20 font-bold px-3 py-1">
                          COMPLETED
                        </Badge>
                      ) : (
                        <Button variant="ghost" size="sm" className="font-bold text-primary group-hover:bg-primary group-hover:text-white rounded-lg">
                          STUDY
                        </Button>
                      )}
                    </div>
                    <div className="sm:hidden">
                       <IconPlayerPlay className={cn(
                         "h-5 w-5 transition-transform group-hover:scale-110",
                         isCompleted ? "text-green-500" : "text-primary"
                       )} />
                    </div>
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

        {/* Course Reviews */}
        <div className="mt-8">
          <CourseReviews
            courseId={parseInt(courseId)}
            userId={user.id}
            userHasReviewed={userHasReviewed}
          />
        </div>
      </main>
    </div>
  )
}
