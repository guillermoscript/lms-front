import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import BreadcrumbComponent from '@/components/exercises/breadcrumb-component'
import ExamCard from '@/components/exercises/exam-card'
import { IconCertificate, IconProgress } from '@tabler/icons-react'
import { Progress } from '@/components/ui/progress'

interface PageProps {
  params: Promise<{ courseId: string }>
}

export default async function ExamsPage({ params }: PageProps) {
  const { courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Consolidated query as requested by the user
  const { data: exams, error } = await supabase
    .from('exams')
    .select(`
        *,
        courses(*),
        exam_submissions (
            submission_id,
            student_id,
            submission_date,
            exam_answers (
                answer_id,
                question_id,
                answer_text,
                is_correct,
                feedback
            ),
            exam_scores (
                score_id,
                score
            )
        )
    `)
    .eq('course_id', parseInt(courseId))
    .eq('status', 'published')
    .eq('exam_submissions.student_id', user.id)
    .order('sequence')

  if (error) {
    console.error('Error fetching exams:', error)
    throw new Error(error.message)
  }

  if (!exams || exams.length === 0) {
    // Check if course exists
    const { data: course } = await supabase.from('courses').select('title').eq('course_id', parseInt(courseId)).single();
    if (!course) notFound();

    return (
      <div className="container mx-auto py-8 px-4 space-y-8">
        <BreadcrumbComponent links={[
          { href: '/dashboard/student', label: 'Dashboard' },
          { href: `/dashboard/student/courses/${courseId}`, label: course.title },
          { href: '#', label: 'Exams' },
        ]} />
        <div className="flex flex-col items-center justify-center py-20 bg-muted/20 border border-dashed rounded-3xl">
          <IconCertificate className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-xl font-semibold text-muted-foreground">No exams available</h3>
          <p className="text-muted-foreground text-center max-w-xs mt-2">
            Evaluations for this course will appear here when published.
          </p>
        </div>
      </div>
    )
  }

  const firstExam = exams[0];
  const courseData = firstExam?.courses;
  const courseTitle = (Array.isArray(courseData) ? courseData[0]?.title : (courseData as any)?.title) || "Course";

  const completedExams = exams.filter(exam => {
    const subs = exam.exam_submissions;
    const submission = Array.isArray(subs) ? subs[0] : (subs as any);
    if (!submission) return false;
    const scores = submission.exam_scores;
    const score = Array.isArray(scores) ? scores[0]?.score : (scores as any)?.score;
    return score !== undefined;
  }).length;
  const totalExams = exams.length
  const progressPercent = (completedExams / totalExams) * 100

  const breadcrumbLinks = [
    { href: '/dashboard/student', label: 'Dashboard' },
    { href: `/dashboard/student/courses/${courseId}`, label: courseTitle },
    { href: '#', label: 'Exams' },
  ]

  return (
    <div className="container mx-auto py-8 px-4 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-4 flex-1">
          <BreadcrumbComponent links={breadcrumbLinks} />
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <IconCertificate size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Assessments</h1>
              <p className="text-muted-foreground">Demonstrate your knowledge and earn your certification.</p>
            </div>
          </div>
        </div>

        <div className="bg-card border rounded-2xl p-4 min-w-[240px] shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <IconProgress size={16} />
              Completion Progress
            </span>
            <span className="text-sm font-bold">{completedExams}/{totalExams}</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {exams.map((exam) => (
          <ExamCard
            key={exam.exam_id}
            exam={exam}
            courseId={courseId}
          />
        ))}
      </div>
    </div>
  )
}

