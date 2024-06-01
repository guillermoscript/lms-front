import { BarChart } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const CourseCard = ({
    title,
    progress,
    totalLessons,
    completedLessons,
    completedTests,
    totalTests,
    approvedTests,
    courseId
}: {
    title: string
    progress: number
    totalLessons: number
    completedLessons: number
    completedTests: number
    totalTests: number
    approvedTests: number
    courseId: number
}) => (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-2xl font-bold">{progress}%</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Total Progress
                    </p>
                </div>
                <BarChart className="w-[100px] aspect-square" />
            </div>
            <div className="grid grid-cols-[1fr_1fr] gap-4 mt-6">
                <div>
                    <p className="text-2xl font-bold">{totalLessons}</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Total Lessons
                    </p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{completedLessons}</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Lessons Completed
                    </p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{completedTests}</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Tests Completed
                    </p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{totalTests}</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Total Tests
                    </p>
                </div>
                <div>
                    <p className="text-2xl font-bold">{approvedTests}</p>
                    <p className="text-gray-500 dark:text-gray-400">
            Tests Approved
                    </p>
                </div>
            </div>
            <div className="mt-6">
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/student/courses/${courseId}/lessons`}
                >
          View Lessons
                </Link>
                <Link
                    className={buttonVariants({ variant: 'link' })}
                    href={`/dashboard/student/courses/${courseId}/exams`}
                >
          View Exams
                </Link>
            </div>
        </CardContent>
    </Card>
)

export default CourseCard
