import { BookOpenTextIcon, PencilLineIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils'

const CourseCard = ({
    title,
    progress,
    totalLessons,
    completedLessons,
    completedTests,
    totalTests,
    approvedTests,
    courseId,
    children,
    img,
    description
}: {
    title: string
    description?: string
    progress: number
    totalLessons: number
    completedLessons: number
    completedTests: number
    totalTests: number
    approvedTests: number
    courseId: number
    children?: React.ReactNode
    img: string
}) => (
    <Card>
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent
            className='p-4'
        >
            <Link
                className="p-4 flex justify-center w-full"
                href={`/dashboard/student/courses/${courseId}`}
            >
                <img src={img}
                    alt='Course Image' className="rounded-md object-cover"
                />
            </Link>
            <div className="flex flex-wrap justify-center gap-4">
                <Link
                    className={cn(
                        buttonVariants({ variant: 'default' }),
                        'flex items-center justify-center gap-2'
                    )}
                    href={`/dashboard/student/courses/${courseId}/lessons`}
                >
                    <BookOpenTextIcon className="h-6 w-6" />
            View Lessons
                </Link>
                <Link
                    className={cn(
                        buttonVariants({ variant: 'secondary' }),
                        'flex items-center justify-center gap-2'
                    )}
                    href={`/dashboard/student/courses/${courseId}/exams`}
                >
                    <PencilLineIcon className="h-6 w-6" />
            View Exams
                </Link>
                {children}
            </div>
            {/* <div className="flex items-center justify-between">
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
            </div> */}
        </CardContent>
    </Card>
)

export default CourseCard
