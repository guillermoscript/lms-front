import dayjs from 'dayjs'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DataTable } from '@/components/ui/Table/data-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createClient } from '@/utils/supabase/server'

import { lessonsCols } from './lessonsCols'
import { testsCols } from './testsCols'

export default async function CreateCourseLessonPage({
    params,
}: {
    params: { courseId: string }
}) {
    const supabase = createClient()

    const course = await supabase
        .from('courses')
        .select('*, lessons(*), exams(*)')
        .eq('course_id', params.courseId)
        .single()

    if (course.error != null) {
        console.log(course.error.message)
    }

    const t = await getI18n()

    const lessonRow = course.data?.lessons?.map((lesson) => {
        return {
            id: lesson.id,
            title: lesson.title,
            content: lesson.content,
            sequence: lesson.sequence,
            description: lesson.description,
            courseId: lesson.course_id,
            date: dayjs(lesson.created_at).format('DD/MM/YYYY'),
        }
    })

    const testRow = course.data?.exams?.map((test) => {
        return {
            title: test.title,
            id: test.exam_id,
            duration: test.duration,
            courseId: test.course_id,
            // finish_data: test.exam_date,
            sequence: test.sequence,
            date: dayjs(test.created_at).format('DD/MM/YYYY'),
            updated_at: test.updated_at,
            description: test.description,
        }
    })

    return (
        <div className="flex-1 p-8 overflow-y-auto w-full space-y-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                    { href: `/dashboard/teacher/courses/${params.courseId}`, label: course?.data?.title }
                ]}
            />
            <h1 className="text-2xl font-semibold  mb-4">
                {course?.data?.title}
            </h1>
            <p>{course?.data?.description}</p>

            <Separator className="my-4 " />
            <Tabs defaultValue="lessons" className="w-full space-y-4">
                <TabsList>
                    <TabsTrigger value="lessons">
                        {t('dashboard.teacher.CreateCourseLessonPage.tabs.lessons')}
                    </TabsTrigger>
                    <TabsTrigger value="tests">
                        {t('dashboard.teacher.CreateCourseLessonPage.tabs.exams')}
                    </TabsTrigger>
                </TabsList>
                <TabsContent
                    className="flex flex-col  w-full  gap-4"
                    value="lessons"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold">
                            {t('dashboard.teacher.CreateCourseLessonPage.tabs.lessons')}
                        </h3>
                        <Link
                            className={buttonVariants({ variant: 'link' })}
                            href={`/dashboard/teacher/courses/${params.courseId}/lessons/`}
                        >
                            {t('dashboard.teacher.CreateCourseLessonPage.tabs.createLesson')}
                        </Link>
                    </div>
                    <DataTable columns={lessonsCols} data={lessonRow as any[]} />
                </TabsContent>
                <TabsContent
                    className="flex flex-col  w-full  gap-4"
                    value="tests"
                >
                    <div className="flex items-center justify-between">
                        <h3 className="text-xl font-semibold">
                            {t('dashboard.teacher.CreateCourseLessonPage.tabs.exams')}
                        </h3>
                        <Link
                            className={buttonVariants({ variant: 'link' })}
                            href={`/dashboard/teacher/courses/${params.courseId}/tests/`}
                        >
                            {t('dashboard.teacher.CreateCourseLessonPage.tabs.createExam')}
                        </Link>
                    </div>

                    <DataTable columns={testsCols} data={testRow as any[]} />
                </TabsContent>
            </Tabs>
        </div>
    )
}
