'use client'
import { ChevronRight, Grid, List, Search } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'

import { useScopedI18n } from '@/app/locales/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const CourseCard = ({
    course,
    t,
    view,
}: {
    course: any
    t: (key: string) => string
    view: 'grid' | 'list'
}) => {
    const totalLessons = course.course.lessons.length
    const totalExams = course.course.exams.length
    const completedLessons = course.course.lessons.filter(
        (lesson) => lesson.lesson_completions.length > 0
    ).length
    const completedExams = course.course.exams.filter(
        (exam) => exam.completed
    ).length

    return (
        <Card
            className={`${
                view === 'grid' ? 'h-full' : 'flex flex-row'
            } overflow-hidden transition-all hover:shadow-lg`}
        >
            <div
                className={`${
                    view === 'grid' ? 'h-48' : 'w-48 h-full'
                } relative`}
            >
                <Image
                    src={course.course.thumbnail_url || '/placeholder.svg'}
                    alt={course.course.title}
                    layout="fill"
                    objectFit="cover"
                />
            </div>
            <div className="flex flex-col flex-grow p-4">
                <CardHeader>
                    <CardTitle className="text-xl">
                        {course.course.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                        {course.course.description}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                            <span>{t('lessons')}</span>
                            <span>
                                {completedLessons}/{totalLessons}
                            </span>
                        </div>
                        <Progress
                            value={(completedLessons / totalLessons) * 100}
                        />
                        <div className="flex justify-between text-sm">
                            <span>{t('exams')}</span>
                            <span>
                                {completedExams}/{totalExams}
                            </span>
                        </div>
                        <Progress value={(completedExams / totalExams) * 100} />
                    </div>
                </CardContent>
                <CardFooter className="flex justify-between flex-wrap md:flex-nowrap items-center gap-4">
                    <Button asChild variant="default">
                        <Link
                            href={`/dashboard/student/courses/${course.course.course_id}`}
                        >
                            {t('continueCourse')}{' '}
                            <ChevronRight className="ml-2 h-4 w-4" />
                        </Link>
                    </Button>
                    <div className="flex space-x-2">
                        <Badge variant="secondary">
                            {totalLessons} {t('lessons')}
                        </Badge>
                        <Badge variant="secondary">
                            {totalExams} {t('exams')}
                        </Badge>
                    </div>
                </CardFooter>
            </div>
        </Card>
    )
}

const CourseDashboard: React.FC<{ userCourses: any[] }> = ({ userCourses }) => {
    const [searchTerm, setSearchTerm] = useState('')
    const [view, setView] = useState<'grid' | 'list'>('grid')
    const t = useScopedI18n('CourseDashboard')

    const filteredCourses = userCourses.filter(
        (course) =>
            course.course.title
                .toLowerCase()
                .includes(searchTerm.toLowerCase()) ||
            course.course.description
                .toLowerCase()
                .includes(searchTerm.toLowerCase())
    )

    return (
        <div
            className='md:container'
        >
            <h1 className="text-3xl font-bold mb-8">{t('yourCourses')}</h1>

            <div className="flex justify-between items-center mb-6">
                <div className="relative w-full max-w-sm">
                    <Input
                        type="text"
                        placeholder={t('searchCourses')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                    />
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                <div className="flex space-x-2">
                    <Button
                        variant={view === 'grid' ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => setView('grid')}
                    >
                        <Grid className="h-4 w-4" />
                    </Button>
                    <Button
                        variant={view === 'list' ? 'default' : 'outline'}
                        size="icon"
                        onClick={() => setView('list')}
                    >
                        <List className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="all" className="mb-6 space-y-4">
                <TabsList>
                    <TabsTrigger value="inProgress">
                        {t('inProgress')}
                    </TabsTrigger>
                    <TabsTrigger value="completed">
                        {t('completed')}
                    </TabsTrigger>
                    <TabsTrigger value="all">{t('allCourses')}</TabsTrigger>
                </TabsList>
                <TabsContent value="inProgress">
                    <div
                        className={`grid gap-6 ${
                            view === 'grid'
                                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                                : 'grid-cols-1'
                        }`}
                    >
                        {filteredCourses
                            .filter((course) => {
                                const totalItems =
                                    course.course.lessons.length +
                                    course.course.exams.length
                                const completedItems =
                                    course.course.lessons.filter(
                                        (l) => l.completed
                                    ).length +
                                    course.course.exams.filter(
                                        (e) => e.completed
                                    ).length
                                return (
                                    completedItems > 0 &&
                                    completedItems < totalItems
                                )
                            })
                            .map((course) => (
                                <CourseCard
                                    key={course.course_id}
                                    course={course}
                                    t={t}
                                    view={view}
                                />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="completed">
                    <div
                        className={`grid gap-6 ${
                            view === 'grid'
                                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                                : 'grid-cols-1'
                        }`}
                    >
                        {filteredCourses
                            .filter((course) => {
                                const totalItems =
                                    course.course.lessons.length +
                                    course.course.exams.length
                                const completedItems =
                                    course.course.lessons.filter(
                                        (l) => l.completed
                                    ).length +
                                    course.course.exams.filter(
                                        (e) => e.completed
                                    ).length
                                return completedItems === totalItems
                            })
                            .map((course) => (
                                <CourseCard
                                    key={course.course_id}
                                    course={course}
                                    t={t}
                                    view={view}
                                />
                            ))}
                    </div>
                </TabsContent>
                <TabsContent value="all">
                    <div
                        className={`grid gap-6 ${
                            view === 'grid'
                                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
                                : 'grid-cols-1'
                        }`}
                    >
                        {filteredCourses.map((course) => (
                            <CourseCard
                                key={course.course_id}
                                course={course}
                                t={t}
                                view={view}
                            />
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {filteredCourses.length === 0 && (
                <div className="text-center py-12">
                    <p className="text-xl text-gray-600 dark:text-gray-400">
                        {t('noCoursesFound')}
                    </p>
                </div>
            )}
        </div>
    )
}

export default CourseDashboard
