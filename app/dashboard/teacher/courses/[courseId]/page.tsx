import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  IconArrowLeft,
  IconPlus,
  IconEdit,
  IconTrash,
  IconEye,
  IconSettings,
} from '@tabler/icons-react'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseManagementPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/auth/login')
  }

  // Get course and verify ownership
  const { data: course } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .eq('author_id', user.id)
    .single()

  if (!course) {
    notFound()
  }

  // Get lessons
  const { data: lessons } = await supabase
    .from('lessons')
    .select('id, title, sequence, status, created_at')
    .eq('course_id', parseInt(courseId))
    .order('sequence', { ascending: true })

  // Get exams
  const { data: exams } = await supabase
    .from('exams')
    .select('exam_id, title, status, duration, created_at')
    .eq('course_id', parseInt(courseId))
    .order('sequence', { ascending: true })

  // Get enrollment count
  const { data: enrollments } = await supabase
    .from('enrollments')
    .select('enrollment_id')
    .eq('course_id', parseInt(courseId))
    .eq('status', 'active')

  const enrollmentCount = enrollments?.length || 0

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
          <Link href="/dashboard/teacher">
            <Button variant="ghost" size="sm" className="mb-4">
              <IconArrowLeft className="mr-2 h-4 w-4" />
              Back to My Courses
            </Button>
          </Link>

          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">{course.title}</h1>
                <Badge
                  variant={
                    course.status === 'published'
                      ? 'default'
                      : course.status === 'draft'
                      ? 'secondary'
                      : 'outline'
                  }
                >
                  {course.status}
                </Badge>
              </div>
              {course.description && (
                <p className="mt-2 text-muted-foreground">{course.description}</p>
              )}
              <p className="mt-2 text-sm text-muted-foreground">
                {enrollmentCount} {enrollmentCount === 1 ? 'student' : 'students'} enrolled
              </p>
            </div>

            <div className="flex gap-2">
              <Link href={`/dashboard/student/courses/${courseId}`}>
                <Button variant="outline">
                  <IconEye className="mr-2 h-4 w-4" />
                  Preview
                </Button>
              </Link>
              <Link href={`/dashboard/teacher/courses/${courseId}/settings`}>
                <Button variant="outline">
                  <IconSettings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="lessons">
          <TabsList>
            <TabsTrigger value="lessons">Lessons</TabsTrigger>
            <TabsTrigger value="exams">Exams</TabsTrigger>
          </TabsList>

          {/* Lessons Tab */}
          <TabsContent value="lessons" className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Course Lessons</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`}>
                <Button>
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Lesson
                </Button>
              </Link>
            </div>

            {lessons && lessons.length > 0 ? (
              <div className="space-y-3">
                {lessons.map((lesson) => (
                  <Card key={lesson.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <span className="text-sm font-medium">{lesson.sequence}</span>
                        </div>
                        <div>
                          <h3 className="font-medium">{lesson.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {lesson.status === 'published' ? (
                              <Badge variant="outline" className="mt-1">
                                Published
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="mt-1">
                                Draft
                              </Badge>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`}>
                          <Button variant="outline" size="sm">
                            <IconEdit className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No lessons yet</p>
                  <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`}>
                    <Button className="mt-4">
                      <IconPlus className="mr-2 h-4 w-4" />
                      Create Your First Lesson
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams" className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Course Exams</h2>
              <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`}>
                <Button>
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Exam
                </Button>
              </Link>
            </div>

            {exams && exams.length > 0 ? (
              <div className="space-y-3">
                {exams.map((exam) => (
                  <Card key={exam.exam_id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <h3 className="font-medium">{exam.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {exam.duration ? `${exam.duration} minutes` : 'No time limit'}
                          {' • '}
                          {exam.status === 'published' ? (
                            <Badge variant="outline" className="ml-2">
                              Published
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-2">
                              Draft
                            </Badge>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link href={`/dashboard/teacher/courses/${courseId}/exams/${exam.exam_id}`}>
                          <Button variant="outline" size="sm">
                            <IconEdit className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No exams yet</p>
                  <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`}>
                    <Button className="mt-4">
                      <IconPlus className="mr-2 h-4 w-4" />
                      Create Your First Exam
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
