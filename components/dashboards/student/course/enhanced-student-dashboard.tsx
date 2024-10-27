'use client'
import {
    BarChart,
    Book,
    ChevronRight,
    Clock,
    MessageCircle,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
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
    enrolled: boolean
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
        (lesson) => lesson.lesson_completions.length > 0
    ).length
    const progress = (completedLessons / totalLessons) * 100
    const t = useScopedI18n('StudentDashboard')

    return (
        <Card className="w-full overflow-hidden">
            <div className="relative h-48">
                <Image
                    src={course.course.thumbnail_url || '/placeholder.svg'}
                    alt={course.course.title}
                    layout="fill"
                    objectFit="cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-0 left-0 p-4 text-white">
                    <h3 className="text-xl font-semibold mb-1">{course.course.title}</h3>
                    <p className="text-sm">
                        {t('progress')}: {completedLessons}/{totalLessons} {t('lessons')}
                    </p>
                </div>
            </div>
            <CardContent className="pt-4">
                <Progress value={progress} className="w-full" />
            </CardContent>
            <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                    <Link href={`/dashboard/student/courses/${course.course_id}`}>
                        {
                            course.enrolled
                                ? t('continueCourse')
                                : t('enrollOnCourse')
                        } <ChevronRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}

const RecentActivityCard = ({ activity }: { activity: LessonView }) => {
    const t = useScopedI18n('StudentDashboard')

    return (
        <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg">
            <div className="flex flex-col sm:flex-row">
                <div className="relative w-full sm:w-1/3 h-56 ">
                    <Image
                        src={activity.lesson_image || '/placeholder.svg'}
                        alt={activity.lesson_title}
                        layout="fill"
                        objectFit="cover"
                    />
                </div>
                <div className="flex-1 p-4">
                    <CardTitle className="text-lg mb-2">{activity.lesson_title}</CardTitle>
                    <CardDescription className="mb-4 line-clamp-2">
                        {activity.lesson_description}
                    </CardDescription>
                    <div className="flex items-center text-sm text-muted-foreground mb-4">
                        <Clock className="mr-2 h-4 w-4" />
                        {t('lastViewed')}: {new Date(activity.viewed_at).toLocaleDateString()}
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link
                            href={`/dashboard/student/courses/${activity.lesson_course_id}/lessons/${activity.lesson_id}`}
                        >
                            {t('continueLesson')} <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                </div>
            </div>
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

    const totalLessonsCompleted = userCourses.reduce((acc, course) => {
        const totalLessons = course.course.lessons.length
        const completedLessons = course.course.lessons.filter(
            (lesson) => lesson.lesson_completions.length > 0
        ).length
        return acc + completedLessons
    }
    , 0)

    const totalLessons = userCourses.reduce((acc, course) => {
        return acc + course.course.lessons.length
    }
    , 0)

    const progress = ((totalLessonsCompleted / totalLessons) * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })

    const t = useScopedI18n('StudentDashboard')

    return (
        <div className="container mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">{t('welcome')}</h1>
                    <p className="text-muted-foreground">{t('dashboardDescription')}</p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('totalCourses')}</CardTitle>
                        <Book className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{userCourses.length}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('averageProgress')}</CardTitle>
                        <BarChart className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{progress}%</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">{t('unreadMessages')}</CardTitle>
                        <MessageCircle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{userChats.length}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6">
                <div className="md:col-span-2">
                    <h2 className="text-2xl font-semibold mb-4">{t('courseProgress')}</h2>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {filteredCourses.slice(0, 3).map((course) => (
                            <CourseProgressCard key={course.course_id} course={course} />
                        ))}
                    </div>
                    {filteredCourses.length > 3 && (
                        <Button asChild variant="link" className="mt-4">
                            <Link href="/dashboard/student/courses">
                                {t('viewAllCourses')} <ChevronRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    )}
                </div>
                <div>
                    <h2 className="text-2xl font-semibold mb-4">{t('recentActivity')}</h2>
                    <div className="space-y-6">
                        {lessonsView.slice(0, 3).map((lesson) => (
                            <RecentActivityCard key={lesson.lesson_id} activity={lesson} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default StudentDashboard
