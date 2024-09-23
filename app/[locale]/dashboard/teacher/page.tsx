import {
    BookIcon,
    ClipboardIcon,
    LayoutGridIcon,
    UsersIcon
} from 'lucide-react'
import Link from 'next/link'

import { getI18n } from '@/app/locales/server'
import BreadcrumbComponent from '@/components/dashboards/student/course/BreadcrumbComponent'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'

export default async function TeacherPage () {
    const t = await getI18n()

    return (
        <>
            <BreadcrumbComponent
                links={[
                    { href: '/dashboard', label: t('BreadcrumbComponent.dashboard') },
                    { href: '/dashboard/teacher', label: t('BreadcrumbComponent.teacher') }
                ]}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Courses</CardTitle>
                        <CardDescription>
              View and manage all your courses.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 gap-4">
                            <Link
                                className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                                href="/dashboard/teacher/courses"
                            >
                                <LayoutGridIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">
                  Courses
                                </span>
                            </Link>
                            <Link
                                className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                                href="#"
                            >
                                <BookIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">
                  Lessons
                                </span>
                            </Link>
                            <Link
                                className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                                href="#"
                            >
                                <ClipboardIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">
                  Tests
                                </span>
                            </Link>
                            <Link
                                className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                                href="#"
                            >
                                <UsersIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                                <span className="text-sm font-medium">
                  Students
                                </span>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>News</CardTitle>
                        <CardDescription>
              Stay up-to-date with the latest news and updates.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <img
                                    alt="News thumbnail"
                                    className="rounded-md"
                                    height="64"
                                    src="/placeholder.svg"
                                    style={{
									  aspectRatio: '64/64',
									  objectFit: 'cover'
                                    }}
                                    width="64"
                                />
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    New Course: Introduction to React
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Learn the fundamentals of React and
                    build your first web application.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <img
                                    alt="News thumbnail"
                                    className="rounded-md"
                                    height="64"
                                    src="/placeholder.svg"
                                    style={{
									  aspectRatio: '64/64',
									  objectFit: 'cover'
                                    }}
                                    width="64"
                                />
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    Upcoming Webinar: Mastering JavaScript
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Join our expert instructor for an
                    in-depth look at advanced JavaScript
                    concepts.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <img
                                    alt="News thumbnail"
                                    className="rounded-md"
                                    height="64"
                                    src="/placeholder.svg"
                                    style={{
									  aspectRatio: '64/64',
									  objectFit: 'cover'
                                    }}
                                    width="64"
                                />
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    New Feature: Personalized Learning Paths
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Customize your learning experience with
                    our new personalized learning paths.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Upcoming Tests</CardTitle>
                        <CardDescription>
              View and prepare for your upcoming tests.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                                    <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    Introduction to Web Development
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Due: April 15, 2023
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                                    <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    Intermediate JavaScript
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Due: May 1, 2023
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-800">
                                    <ClipboardIcon className="h-6 w-6 text-gray-500 dark:text-gray-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium">
                    Foundations of Data Science
                                    </h3>
                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                    Due: June 1, 2023
                                    </p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </>
    )
}
