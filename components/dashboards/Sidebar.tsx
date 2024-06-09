
import { BookIcon, HomeIcon } from 'lucide-react'
import Link from 'next/link'

import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger
} from '@/components/ui/menubar'
import { getServerUserRole } from '@/utils/supabase/getUserRole'
import { createClient } from '@/utils/supabase/server'

import { Button } from '../ui/button'
import SidebarLink from './SidebarLink'

async function Sidebar ({ children }: { children?: React.ReactNode }) {
    const supabase = createClient()

    const coursesContent = await supabase.from('courses').select('course_id, title, lessons(id, title), exams(exam_id,title)')

    const userRole = await getServerUserRole()

    if (coursesContent.error) {
        console.log(coursesContent.error)
    }

    return (
        <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
            <div className="flex h-full max-h-screen flex-col gap-2">
                <div className="flex h-[60px] items-center border-b px-6">
                    <Link className="flex items-center gap-2 font-semibold" href="#">
                        <BookIcon className="h-6 w-6" />
                        <span>LMS Academy</span>
                    </Link>
                    <Button className="ml-auto h-8 w-8" size="icon" variant="outline">
                        <BookIcon className="h-4 w-4" />
                        <span className="sr-only">Toggle notifications</span>
                    </Button>
                </div>
                <nav className="flex-1 overflow-auto py-2 px-4 text-sm font-medium">
                    {/* Links */}
                    <SidebarLink icon={HomeIcon} text="Dashboard" href="/dashboard" />
                    <Menubar
                        className="flex flex-col gap-2 h-auto justify-start w-fit bg-transparent border-none px-4 py-2 items-start"
                        aria-label="Main"
                    >
                        {coursesContent.data.map((course) => (
                            <MenubarMenu key={course.course_id}>
                                <MenubarTrigger>
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
                    {/* <SidebarLink
                        icon={LayoutGridIcon}
                        text="Courses"
                        href="/dashboard/courses"
                        active
                    /> */}
                    {children}
                </nav>
            </div>
        </div>
    )
}

export default Sidebar
