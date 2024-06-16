import { Separator } from '@radix-ui/react-dropdown-menu'
import { BookTextIcon, Building, Link, User } from 'lucide-react'

import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger } from '@/components/ui/menubar'
import { createClient } from '@/utils/supabase/server'
import { Tables } from '@/utils/supabase/supabase'

import SidebarLink from '../SidebarLink'

export default async function BigSidebar ({ userRole }: { userRole: Tables<'user_roles'>['role'] }) {
    const supabase = createClient()
    const coursesContent = await supabase.from('courses').select('course_id, title, lessons(id, title), exams(exam_id,title)')

    if (coursesContent.error) {
        throw new Error(coursesContent.error.message)
    }

    return (
        <div className="flex h-full max-h-screen flex-col gap-2">
            <nav className="flex-1 overflow-auto py-2 px-4 text-sm font-medium">

                <div className='flex items-center gap-2'>
                    <Building className='h-6 w-6' />
                    <p className='text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 my-3'>
                        Main
                    </p>
                </div>
                <SidebarLink icon={User} text="Account" href="/dashboard/account" />
                <Separator />
                <div className='flex items-center gap-2'>
                    <BookTextIcon className='h-6 w-6' />
                    <p className='text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-50 my-3'>
                        Courses
                    </p>
                </div>
                <Menubar
                    className="flex flex-col gap-2 h-auto justify-start w-fit bg-transparent border-none px-4 py-2 items-start"
                    aria-label="Main"
                >
                    {coursesContent.data.map((course) => (
                        <MenubarMenu key={course.course_id}>
                            <MenubarTrigger
                                className=' ml-0'
                            >
                                {course.title}
                            </MenubarTrigger>
                            <MenubarContent>
                                <MenubarSub>
                                    <MenubarSubTrigger>
                Lessons
                                    </MenubarSubTrigger>
                                    <MenubarSubContent>
                                        {course.lessons.map((lesson) => (
                                            <Link key={lesson.id} href={`/dashboard/${userRole}/courses/${course.course_id}/lessons/${lesson.id}`}>
                                                <MenubarItem>
                                                    {lesson.title}
                                                </MenubarItem>
                                            </Link>
                                        ))}
                                    </MenubarSubContent>
                                </MenubarSub>
                                <MenubarSeparator />
                                <MenubarSub>
                                    <MenubarSubTrigger>
                Exams
                                    </MenubarSubTrigger>
                                    <MenubarSubContent>
                                        {course.exams.map((exam) => (
                                            <Link key={exam.exam_id} href={`/dashboard/${userRole}/courses/${course.course_id}/exams/${exam.exam_id}`}>
                                                <MenubarItem>
                                                    {exam.title}
                                                </MenubarItem>
                                            </Link>
                                        ))}
                                    </MenubarSubContent>
                                </MenubarSub>
                            </MenubarContent>
                        </MenubarMenu>
                    ))}
                </Menubar>
            </nav>
        </div>
    )
}
