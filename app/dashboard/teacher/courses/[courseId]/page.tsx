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
  IconUsers,
  IconBook,
  IconBolt,
  IconFileText,
  IconTarget,
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
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('*')
    .eq('course_id', parseInt(courseId))
    .single()

  if (courseError || !course) {
    return (
      <div className="p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <IconArrowLeft /> Course Not Found
            </CardTitle>
            <CardDescription>
              The course with ID {courseId} could not be found or you don't have permission to view it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/teacher/courses">
              <Button variant="outline">Back to My Courses</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Ownership check - simplified for debugging but keeping security in mind
  const isOwner = course.author_id === user.id
  
  if (!isOwner) {
    return (
      <div className="p-8">
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Access Denied
            </CardTitle>
            <CardDescription>
              You are not the author of this course.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-xs font-mono bg-muted p-4 rounded">
              <p>Logged-in User: {user.id}</p>
              <p>Course Author: {course.author_id}</p>
            </div>
            <Link href="/dashboard/teacher/courses">
              <Button variant="outline">Back to My Courses</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Fetch all related data in parallel
  const [lessonsRes, exercisesRes, examsRes, enrollmentsRes] = await Promise.all([
    supabase
      .from('lessons')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .order('sequence', { ascending: true }),
    supabase
      .from('exercises')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .order('created_at', { ascending: false }),
    supabase
      .from('exams')
      .select('*')
      .eq('course_id', parseInt(courseId))
      .order('sequence', { ascending: true }),
    supabase
      .from('enrollments')
      .select('*, profiles(id, full_name, avatar_url)')
      .eq('course_id', parseInt(courseId))
      .eq('status', 'active')
  ])

  const lessons = lessonsRes.data || []
  const exercises = exercisesRes.data || []
  const exams = examsRes.data || []
  const enrollments = enrollmentsRes.data || []

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Link href="/dashboard/teacher">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <IconArrowLeft className="h-4 w-4" />
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
                <Badge variant={course.status === 'published' ? 'default' : 'secondary'}>
                  {course.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground ml-10">
                {enrollments.length} {enrollments.length === 1 ? 'student' : 'students'} enrolled
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/dashboard/student/courses/${courseId}`}>
                <Button variant="outline" size="sm">
                  <IconEye className="mr-2 h-4 w-4" />
                  Preview
                </Button>
              </Link>
              <Link href={`/dashboard/teacher/courses/${courseId}/settings`}>
                <Button variant="outline" size="sm">
                  <IconSettings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs defaultValue="lessons" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="lessons" className="flex items-center gap-2">
              <IconBook size={16} /> Lessons
            </TabsTrigger>
            <TabsTrigger value="exercises" className="flex items-center gap-2">
              <IconTarget size={16} /> Exercises
            </TabsTrigger>
            <TabsTrigger value="exams" className="flex items-center gap-2">
              <IconFileText size={16} /> Exams
            </TabsTrigger>
            <TabsTrigger value="students" className="flex items-center gap-2">
              <IconUsers size={16} /> Students
            </TabsTrigger>
          </TabsList>

          {/* Lessons Tab */}
          <TabsContent value="lessons" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Curriculum</h2>
                <p className="text-sm text-muted-foreground">Manage your course lessons and content.</p>
              </div>
              <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`}>
                <Button size="sm">
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Lesson
                </Button>
              </Link>
            </div>

            <div className="grid gap-3">
              {lessons.length > 0 ? (
                lessons.map((lesson) => (
                  <Card key={lesson.id} className="group hover:border-primary/50 transition-colors">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
                          {lesson.sequence}
                        </div>
                        <div>
                          <h3 className="font-medium group-hover:text-primary transition-colors">{lesson.title}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant={lesson.status === 'published' ? 'outline' : 'secondary'} className="text-[10px] h-4">
                              {lesson.status}
                            </Badge>
                            {lesson.video_url && (
                              <Badge variant="outline" className="text-[10px] h-4">Video</Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/teacher/courses/${courseId}/lessons/${lesson.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <IconEdit size={16} />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <IconBook className="h-12 w-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No lessons found for this course.</p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/lessons/new`} className="mt-4">
                      <Button variant="outline" size="sm">Create First Lesson</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Exercises Tab */}
          <TabsContent value="exercises" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Practice Exercises</h2>
                <p className="text-sm text-muted-foreground">Interactive tasks and challenges for students.</p>
              </div>
              <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`}>
                <Button size="sm">
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Exercise
                </Button>
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {exercises.length > 0 ? (
                exercises.map((exercise) => (
                  <Card key={exercise.id} className="overflow-hidden hover:border-primary/50 transition-colors">
                    <CardHeader className="p-4 pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">{exercise.exercise_type.replace('_', ' ')}</Badge>
                          <Badge variant={exercise.status === 'published' ? 'default' : 'secondary'} className="text-[10px] h-4">
                            {exercise.status}
                          </Badge>
                        </div>
                        <Badge variant={
                          exercise.difficulty_level === 'hard' ? 'destructive' : 
                          exercise.difficulty_level === 'medium' ? 'default' : 'secondary'
                        } className="capitalize">
                          {exercise.difficulty_level}
                        </Badge>
                      </div>
                      <CardTitle className="text-lg mt-2 line-clamp-1">{exercise.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 pt-0 space-y-4">
                      <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
                        {exercise.description || 'No description provided.'}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <IconBolt size={12} /> {exercise.time_limit || 0} min
                        </span>
                        <Link href={`/dashboard/teacher/courses/${courseId}/exercises/${exercise.id}`}>
                          <Button variant="ghost" size="sm" className="h-8">
                            Edit <IconEdit className="ml-2 h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="col-span-full border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <IconTarget className="h-12 w-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No exercises created yet.</p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/exercises/new`} className="mt-4">
                      <Button variant="outline" size="sm">Create First Exercise</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Exams Tab */}
          <TabsContent value="exams" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Assessments</h2>
                <p className="text-sm text-muted-foreground">Formal tests and quizzes for grading.</p>
              </div>
              <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`}>
                <Button size="sm">
                  <IconPlus className="mr-2 h-4 w-4" />
                  Add Exam
                </Button>
              </Link>
            </div>

            <div className="grid gap-3">
              {exams.length > 0 ? (
                exams.map((exam) => (
                  <Card key={exam.exam_id} className="group hover:border-primary/50 transition-colors">
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                          <IconFileText size={20} />
                        </div>
                        <div>
                          <h3 className="font-medium group-hover:text-primary transition-colors">{exam.title}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              {exam.duration} min
                            </span>
                            <Badge variant={exam.status === 'published' ? 'outline' : 'secondary'} className="text-[10px] h-4">
                              {exam.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/teacher/courses/${courseId}/exams/${exam.exam_id}/submissions`}>
                          <Button variant="ghost" size="sm" className="h-8">
                            Submissions
                          </Button>
                        </Link>
                        <Link href={`/dashboard/teacher/courses/${courseId}/exams/${exam.exam_id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <IconEdit size={16} />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <IconFileText className="h-12 w-12 text-muted-foreground/20 mb-4" />
                    <p className="text-muted-foreground">No exams found for this course.</p>
                    <Link href={`/dashboard/teacher/courses/${courseId}/exams/new`} className="mt-4">
                      <Button variant="outline" size="sm">Create First Exam</Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Enrolled Students</h2>
                <p className="text-sm text-muted-foreground">View and manage students enrolled in this course.</p>
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="px-4 py-3 text-left font-medium">Student</th>
                        <th className="px-4 py-3 text-left font-medium">Enrollment Date</th>
                        <th className="px-4 py-3 text-left font-medium">Status</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrollments.length > 0 ? (
                        enrollments.map((enrollment: any) => (
                          <tr key={enrollment.enrollment_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center overflow-hidden border">
                                  {enrollment.profiles?.avatar_url ? (
                                    <img src={enrollment.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <IconUsers className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <span className="font-medium">{enrollment.profiles?.full_name || 'Unknown Student'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Date(enrollment.enrollment_date).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="outline" className="capitalize">{enrollment.status}</Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button variant="ghost" size="sm">View Progress</Button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                            No students enrolled in this course yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
