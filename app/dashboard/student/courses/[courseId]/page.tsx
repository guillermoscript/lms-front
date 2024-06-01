import { Badge } from '@/components/ui/badge'
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'
import { BarChart } from 'lucide-react'
import Link from 'next/link'

export default async function CourseStudentPage ({
  params
}: {
  params: { courseId: string }
}) {
  const supabase = createClient()

  const courseData = await supabase
    .from('courses')
    .select(
			`*,
		lessons(*),
		exams(*,
			exam_scores(*)
		)
	`
    )
    .eq('course_id', params.courseId)
    .single()

  if (courseData.error != null) {
    throw new Error(courseData.error.message)
  }

  console.log(courseData)

  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">
              Dashboard
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="text-primary-500 dark:text-primary-400"
              href="/dashboard/student"
            >
              Student
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              className="text-primary-500 dark:text-primary-400"
              href={`/dashboard/student/courses/${courseData.data.course_id}`}
            >
              {courseData.data.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-1 lg:grid-cols-1">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>{courseData.data.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h3 className="text-xl font-bold mb-4">
                  Course Overview
                </h3>
                <div className="grid grid-cols-[1fr_1fr] gap-4">
                  {/* {courseData.data.stats.map((stat) => (
										<CourseStats
											title={stat.title}
											value={stat.value}
										/>
									))} */}
                </div>
                <div className="mt-6">
                  <BarChart className="w-full aspect-[4/1]" />
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-4">Lessons</h3>
                <div className="grid gap-4">
                  {courseData.data.lessons.sort((a, b) => a?.sequence - b?.sequence).map((lesson) => (
                    <LessonCard
                      title={lesson.title}
                      lessonNumber={lesson.sequence}
                      description={lesson.description}
                      status={lesson.status}
                      courseId={courseData.data.course_id}
                      lessonId={lesson.id}
                    />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xl font-bold mb-4">Exams</h3>
                <div className="grid gap-4">
                  {courseData.data.exams.sort((a, b) => a?.sequence - b?.sequence).map((exam) => (
                    <ExamCard
                      title={exam.title}
                      examNumber={exam.sequence}
                      description={exam.description}
                      status={exam.status}
                      grade={'100'}
                      courseId={courseData.data.course_id}
                      examId={exam.exam_id}
                    />
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

const CourseStats = ({ title, value }: { title: string, value: string }) => (
  <div>
    <p className="text-2xl font-bold">{value}</p>
    <p className="text-gray-500 dark:text-gray-400">{title}</p>
  </div>
)

const LessonCard = ({
  title,
  lessonNumber,
  description,
  status,
  courseId,
  lessonId
}: {
  title: string
  lessonNumber: number
  description: string
  status: string
  courseId: number
  lessonId: number
}) => (
  <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-lg font-bold">{title}</h4>
        <p className="text-gray-500 dark:text-gray-400">
          Lesson {lessonNumber}
        </p>
      </div>
      <div>
        <Badge variant={status}>{status}</Badge>
      </div>
    </div>
    <div className="mt-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <div className="mt-2">
        <Link className={
					buttonVariants({ variant: 'link' })
				} href={`/dashboard/student/courses/${courseId}/lessons/${lessonId}`}
        >
          View Lesson
        </Link>
      </div>
    </div>
  </div>
)

const ExamCard = ({
  title,
  examNumber,
  description,
  status,
  grade,
  courseId,
  examId
}: {
  title: string
  examNumber: number
  description: string
  status: string
  grade: number
  courseId: number
  examId: number
}) => (
  <div className="border border-gray-200 rounded-lg p-4 dark:border-gray-800">
    <div className="flex items-center justify-between">
      <div>
        <h4 className="text-lg font-bold">{title}</h4>
        <p className="text-gray-500 dark:text-gray-400">
          Exam {examNumber}
        </p>
      </div>
      <div>
        <Badge variant={status}>{status}</Badge>
      </div>
    </div>
    <div className="mt-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <div className="mt-2">
        <div className="flex items-center justify-between">
          <p>Grade: {grade}%</p>
          <Link className={
						buttonVariants({ variant: 'link' })
					} href={`/dashboard/student/courses/${courseId}/exams/${examId}`}
          >
            View Exam
          </Link>
        </div>
      </div>
    </div>
  </div>
)
