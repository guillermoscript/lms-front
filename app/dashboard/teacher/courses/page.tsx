// @ts-nocheck
import dayjs from 'dayjs'

import CreateCourse from '@/components/dashboards/teacher/course/CreateCourse'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
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

    const course = await supabase.from('courses').select('*')

    if (course.error != null) {
        console.log(course.error.message)
    }

    console.log(course.data)

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
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard">
                          Dashboard
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/dashboard/teacher">
                          Teacher
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink
                            className="text-primary-500 dark:text-primary-400"
                            href="/dashboard/teacher/courses"
                        >
                            Courses
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
            <h1 className="text-2xl font-semibold mb-4">
                List And Create course page
            </h1>
            <Dialog>
                <DialogTrigger asChild>
                    <Button>Create a new course</Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create a new course</DialogTitle>
                        <DialogDescription>
                          Fill in the form below to create a new course
                        </DialogDescription>
                    </DialogHeader>
                    <CreateCourse />
                </DialogContent>
            </Dialog>

            <DataTable columns={courseCols} data={rows} />
        </div>
    )
}
