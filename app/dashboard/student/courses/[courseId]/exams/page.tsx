import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { IconArrowLeft, IconClock, IconFileText, IconCheck } from '@tabler/icons-react'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function ExamsPage({ params }: PageProps) {
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

  // Get course info
  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('course_id', parseInt(courseId))
    .single()

  if (!course) {
    notFound()
  }

  // Get all published exams for this course
  const { data: exams } = await supabase
    .from('exams')
    .select(`
      exam_id,
      title,
      description,
      duration,
      sequence
    `)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .order('sequence', { ascending: true })

  // Get user's exam submissions to check which are completed
  const { data: submissions } = await supabase
    .from('exam_submissions')
    .select('exam_id, submission_id')
    .eq('student_id', user.id)

  // Get exam scores
  const { data: scores } = await supabase
    .from('exam_scores')
    .select('exam_id, score')
    .eq('student_id', user.id)

  const submissionMap = new Map(submissions?.map(s => [s.exam_id, s.submission_id]) || [])
  const scoreMap = new Map(scores?.map(s => [s.exam_id, s.score]) || [])

  return (
    <div className="container mx-auto max-w-4xl py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <Link href={`/dashboard/student/courses/${courseId}`}>
          <Button variant="ghost" size="sm" className="mb-4">
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Back to Course
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        <p className="text-muted-foreground">Course Exams</p>
      </div>

      {/* Exams List */}
      {exams && exams.length > 0 ? (
        <div className="space-y-4">
          {exams.map((exam) => {
            const hasSubmission = submissionMap.has(exam.exam_id)
            const score = scoreMap.get(exam.exam_id)

            return (
              <Card key={exam.exam_id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <IconFileText className="h-5 w-5" />
                        {exam.title}
                        {hasSubmission && (
                          <Badge variant="secondary" className="ml-2">
                            <IconCheck className="mr-1 h-3 w-3" />
                            Completed
                          </Badge>
                        )}
                      </CardTitle>
                      {exam.description && (
                        <CardDescription className="mt-2">
                          {exam.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {exam.duration && (
                        <span className="flex items-center gap-1">
                          <IconClock className="h-4 w-4" />
                          {exam.duration} minutes
                        </span>
                      )}
                      {score !== undefined && (
                        <span className="font-medium text-foreground">
                          Score: {Number(score).toFixed(0)}%
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {hasSubmission ? (
                        <Link href={`/dashboard/student/courses/${courseId}/exams/${exam.exam_id}/review`}>
                          <Button variant="outline">View Results</Button>
                        </Link>
                      ) : (
                        <Link href={`/dashboard/student/courses/${courseId}/exams/${exam.exam_id}`}>
                          <Button>Take Exam</Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <IconFileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No exams available for this course yet.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
