'use client'
import {
    BarChart,
    Book,
    Calendar,
    ChevronRight,
    MessageCircle,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface Course {
    course_id: string
    course: {
        title: string
        description: string
        thumbnail_url: string
        lessons: any[]
        exams: any[]
    }
}

interface LessonView {
    lesson_id: string
    viewed_at: string
    lesson_title: string
    lesson_description: string
    lesson_course_id: string
    lesson_image: string
    lesson_sequence: number
}

interface StudentDashboardProps {
    userCourses: Course[]
    lessonsView: LessonView[]
    userChats: any[]
}

const CourseProgressCard = ({ course }: { course: Course }) => {
    const totalLessons = course.course.lessons.length
    const completedLessons = course.course.lessons.filter(
        (lesson) => lesson.completed
    ).length
    const progress = (completedLessons / totalLessons) * 100
    const t = useScopedI18n('StudentDashboard')

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <div className="w-12 h-12 rounded-full overflow-hidden mr-4">
                    <Image
                        src={course.course.thumbnail_url || '/placeholder.svg'}
                        alt={course.course.title}
                        width={48}
                        height={48}
                        objectFit="cover"
                    />
                </div>
                <div>
                    <CardTitle className="text-lg">
                        {course.course.title}
                    </CardTitle>
                    <CardDescription>
                        {t('progress')}: {completedLessons}/{totalLessons}{' '}
                        {t('lessons')}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <Progress value={progress} className="w-full" />
            </CardContent>
            <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                    <Link
                        href={`/dashboard/student/courses/${course.course_id}`}
                    >
                        {t('continueCourse')}{' '}
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}

const RecentActivityCard = ({ activity }: { activity: LessonView }) => {
    const t = useScopedI18n('StudentDashboard')

    return (
        <Card>
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
                <div className="w-10 h-10 rounded-full overflow-hidden mr-4">
                    <Image
                        src={activity.lesson_image || '/placeholder.svg'}
                        alt={activity.lesson_title}
                        width={40}
                        height={40}
                        objectFit="cover"
                    />
                </div>
                <div>
                    <CardTitle className="text-md">
                        {activity.lesson_title}
                    </CardTitle>
                    <CardDescription className="text-xs">
                        {t('lastViewed')}:{' '}
                        {new Date(activity.viewed_at).toLocaleDateString()}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                    <Link
                        href={`/dashboard/student/courses/${activity.lesson_course_id}/lessons/${activity.lesson_id}`}
                    >
                        {t('continueLesson')}{' '}
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({
    userCourses,
    lessonsView,
    userChats,
}) => {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredCourses = userCourses.filter(
        (course) =>
            course.course.title
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
            course.course.description
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
    )

    const t = useScopedI18n('StudentDashboard')

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">
                        {t('welcome')}
                    </h1>
                    <p className="text-muted-foreground">
                        {t('dashboardDescription')}
                    </p>
                </div>
                <Avatar className="h-12 w-12">
                    <AvatarImage src="/placeholder-avatar.jpg" alt="Student" />
                    <AvatarFallback>ST</AvatarFallback>
                </Avatar>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('totalCourses')}
                        </CardTitle>
                        <Book className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {userCourses.length}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('averageProgress')}
                        </CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">68%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('upcomingDeadlines')}
                        </CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">3</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t('unreadMessages')}
                        </CardTitle>
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {userChats.length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <div className="md:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4">
                        {t('courseProgress')}
                    </h2>
                    <div className="space-y-4">
                        {filteredCourses.slice(0, 3).map((course) => (
                            <CourseProgressCard
                                key={course.course_id}
                                course={course}
                            />
                        ))}
                    </div>
                    {filteredCourses.length > 3 && (
                        <Button asChild variant="link" className="mt-4">
                            <Link href="/dashboard/student/courses">
                                {t('viewAllCourses')}{' '}
                                <ChevronRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    )}
                </div>
                <div>
                    <h2 className="text-2xl font-semibold mb-4">
                        {t('recentActivity')}
                    </h2>
                    <div className="space-y-4">
                        {lessonsView.slice(0, 3).map((lesson) => (
                            <RecentActivityCard
                                key={lesson.lesson_id}
                                activity={lesson}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default StudentDashboard