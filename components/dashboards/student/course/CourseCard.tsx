import Link from 'next/link'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const CourseCard = ({
    title,
    courseId,
    children,
    img,
    description,
}: {
    title: string
    description?: string
    courseId: number
    children?: React.ReactNode
    img: string
}) => (
    <Card className="h-full flex flex-col justify-between">
        <CardHeader>
            <CardTitle>
                <Link href={`/dashboard/student/courses/${courseId}`}>{title}</Link>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="p-4 flex-grow">
            <Link className="p-4 flex justify-center w-full" href={`/dashboard/student/courses/${courseId}`}>
                <img src={img} alt="Course Image" className="rounded-md object-cover max-h-48 w-full" />
            </Link>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
                {children}
            </div>
        </CardContent>
    </Card>
)

export default CourseCard
