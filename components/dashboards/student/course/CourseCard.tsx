import { BookOpenTextIcon, PencilLineIcon } from 'lucide-react'
import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/utils'

const CourseCard = ({
    title,
    courseId,
    children,
    img,
    description
}: {
    title: string
    description?: string
    courseId: number
    children?: React.ReactNode
    img: string
}) => (
    <Card className="h-full flex flex-col justify-between">
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="p-4 flex-grow">
            <Link className="p-4 flex justify-center w-full" href={`/dashboard/student/courses/${courseId}`}>
                <img src={img} alt="Course Image" className="rounded-md object-cover max-h-48 w-full" />
            </Link>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
                <Link
                    className={cn(buttonVariants({ variant: 'default' }), 'flex items-center justify-center gap-2')}
                    href={`/dashboard/student/courses/${courseId}/lessons`}
                >
                    <BookOpenTextIcon className="h-6 w-6" />
          View Lessons
                </Link>
                <Link
                    className={cn(buttonVariants({ variant: 'secondary' }), 'flex items-center justify-center gap-2')}
                    href={`/dashboard/student/courses/${courseId}/exams`}
                >
                    <PencilLineIcon className="h-6 w-6" />
          View Exams
                </Link>
                {children}
            </div>
        </CardContent>
    </Card>
)

export default CourseCard
