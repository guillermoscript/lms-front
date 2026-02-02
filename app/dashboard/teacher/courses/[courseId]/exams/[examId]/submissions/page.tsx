import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { IconArrowLeft } from '@tabler/icons-react'

export default async function SubmissionsPage({ params }: { params: Promise<{ courseId: string; examId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return notFound()

  const { courseId, examId } = await params

  // Fetch exam details
  const { data: exam } = await supabase
    .from('exams')
    .select('*')
    .eq('exam_id', examId)
    .single()

  if (!exam) return notFound()

  // Fetch submissions with related data
  const { data: rawSubmissions, error: submissionsError } = await supabase
    .from('exam_submissions')
    .select('*')
    .eq('exam_id', examId)
    .order('submission_date', { ascending: false })

  // Fetch student profiles
  const studentIds = rawSubmissions?.map(s => s.student_id) || []
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', studentIds)

  // Fetch scores
  const submissionIds = rawSubmissions?.map(s => s.submission_id) || []
  const { data: scores } = await supabase
    .from('exam_scores')
    .select('submission_id, score, feedback, is_overridden')
    .in('submission_id', submissionIds)

  // Combine the data
  const submissions = rawSubmissions?.map(submission => ({
    ...submission,
    student: students?.find(s => s.id === submission.student_id),
    score: scores?.filter(sc => sc.submission_id === submission.submission_id)
  }))

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Link href={`/dashboard/teacher/courses/${courseId}`}>
        <Button variant="ghost" size="sm" className="mb-4">
          <IconArrowLeft className="mr-2 h-4 w-4" />
          Back to Course
        </Button>
      </Link>

      <h1 className="text-3xl font-bold">Submissions for: {exam.title}</h1>

      {submissions && submissions.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            <p>No submissions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {submissions?.map((submission) => {
            const scoreData = submission.score?.[0]
            const reviewStatus = submission.review_status || 'pending'

            return (
              <Card key={submission.submission_id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{submission.student?.full_name || 'Unknown Student'}</p>
                      <p className="text-sm text-muted-foreground">
                        Submitted: {new Date(submission.submission_date).toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        {scoreData ? (
                          <>
                            <span className="text-sm">Score: {scoreData.score?.toFixed(1)}/100</span>
                            {scoreData.is_overridden && (
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Teacher Override</span>
                            )}
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not graded yet</span>
                        )}
                        <span className={`text-xs px-2 py-1 rounded ${
                          reviewStatus === 'teacher_reviewed' ? 'bg-green-100 text-green-800' :
                          reviewStatus === 'ai_reviewed' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {reviewStatus}
                        </span>
                      </div>
                    </div>

                    <Link href={`/dashboard/teacher/courses/${courseId}/exams/${examId}/submissions/${submission.submission_id}`}>
                      <Button>Review</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
