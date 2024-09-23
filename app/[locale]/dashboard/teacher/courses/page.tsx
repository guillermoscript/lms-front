import dayjs from 'dayjs'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import CreateCourse from '@/components/dashboards/teacher/course/CreateCourse'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog'
import { DataTable } from '@/components/ui/Table/data-table'
import { createClient } from '@/utils/supabase/server'

import { courseCols } from './courseCols'
export default async function CreateCoursePage () {
    const supabase = createClient()

    const course = await supabase.from('courses').select('*').order('created_at', { ascending: false })

    if (course.error != null) {
        console.log(course.error.message)
    }

    const t = await getI18n()

    const rows = course.data?.map((course) => {
        return {
            id: course.course_id,
            title: course.title,
            description: course.description,
            status: course.status,
            date: dayjs(course.created_at).format('DD/MM/YYYY')
        }
    })

    return (
        <div className=" flex-1 p-8 overflow-auto w-full space-y-4">
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') },
                    { href: '/dashboard/teacher/courses', label: t('BreadcrumbComponent.course') },
                ]}
            />
            <h1 className="text-2xl font-semibold mb-4">
                {t('dashboard.teacher.CreateCoursePage.title')}
            </h1>
            <Dialog>
                <DialogTrigger asChild>
                    <Button>
                        {t('dashboard.teacher.CreateCoursePage.actionButton')}
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('dashboard.teacher.CreateCoursePage.dialogTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('dashboard.teacher.CreateCoursePage.dialogDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    <CreateCourse />
                </DialogContent>
            </Dialog>

            <DataTable columns={courseCols} data={rows as any[]} />
        </div>
    )
}
