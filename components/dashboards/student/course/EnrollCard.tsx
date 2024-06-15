import EnrollButton from '@/components/dashboards/student/course/EnrollButton'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function EnrollCard ({
    courseId
}: {
    courseId: number
}) {
    return (
        <div className='grid gap-8'>
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
                            href="/dashboard/student/courses"
                        >
                            Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <Card>
                <CardHeader>
                    <CardTitle>
                                        You are not enrolled in this course
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className=' mb-4'>
                                        You need to enroll in this course to access the lessons.
                    </p>
                    <EnrollButton courseId={courseId} />
                </CardContent>
            </Card>
        </div>
    )
}
