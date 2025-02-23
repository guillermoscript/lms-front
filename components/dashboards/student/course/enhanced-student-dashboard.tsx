import { ArrowRight, CalendarDays, GraduationCap } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useScopedI18n } from '@/app/locales/client'

export function CourseCard({ course, t }: { course: any, t: any }) {
    const totalLessons = course.course.lessons.length
    const completedLessons = course.course.lessons.filter((lesson: any) => lesson.lesson_completions?.length > 0).length
    const progress = (completedLessons / totalLessons) * 100

    const upcomingExams = course.course.exams
        ?.filter((exam: any) => new Date(exam.exam_date) > new Date())
        .sort((a: any, b: any) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime())

    return (
        <Card className="group overflow-hidden">
            <div className="relative aspect-video">
                <Image
                    src={course.course.thumbnail_url || '/placeholder.svg?height=200&width=400'}
                    alt={course.course.title}
                    className="object-cover transition-transform group-hover:scale-105"
                    fill
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black to-background/20" />
                <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-lg font-semibold text-white mb-2">{course.course.title}</h3>
                    <Progress value={progress} className="h-2 bg-white/20" />
                </div>
            </div>
            <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{t('CourseCard.progress')}</p>
                    <p className="text-sm text-muted-foreground">
                        {t('CourseCard.lessonsProgress', { completedLessons, totalLessons })}
                    </p>
                </div>
                {upcomingExams?.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <GraduationCap className="h-4 w-4" />
                            <span>
                                {t('CourseCard.nextExam', { date: new Date(upcomingExams[0].exam_date).toLocaleDateString() })}
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
            <CardFooter>
                <Button asChild className="w-full">
                    <Link href={`/dashboard/student/courses/${course.course_id}`}>
                        {t('CourseCard.continueLearning')}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </Button>
            </CardFooter>
        </Card>
    )
}

export function RecentActivityCard({ activity, t }: { activity: any, t: any }) {
    
    return (
        <Card className="overflow-hidden">
            <div className="flex gap-4 flex-col md:flex-row">
                <div className="relative w-full md:w-[120px] h-[120px]"> 
                    <Image
                        src={activity.lesson_image || '/placeholder.svg?height=120&width=120'}
                        alt={activity.lesson_title}
                        className="object-cover"
                        fill
                    />
                </div>
                <div className="flex-1 py-4 px-4 md:pr-4">
                    <h4 className="font-semibold mb-1">{activity.lesson_title}</h4>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{activity.lesson_description}</p>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <CalendarDays className="h-4 w-4" />
                            <span>
                                {t('RecentActivity.lastViewed', { date: new Date(activity.viewed_at).toLocaleDateString() })}
                            </span>
                        </div>
                        <Button asChild variant="ghost" size="sm">
                            <Link href={`/dashboard/student/courses/${activity.lesson_course_id}/lessons/${activity.lesson_id}`}>
                                {t('RecentActivity.continueLabel')}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        </Card>
    )
}

export function StatCard({
    title,
    value,
    description,
    icon: Icon,
}: {
    title: string
    value: string | number
    description?: string
    icon: any
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
            </CardContent>
        </Card>
    )
}
