import {
    BookIcon,
    ClipboardIcon,
    LayoutGridIcon,
    Link,
    UsersIcon
} from 'lucide-react'

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card'

export default function CourseCards () {
    return (
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
                        href="#"
                    >
                        <LayoutGridIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium">Courses</span>
                    </Link>
                    <Link
                        className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        href="#"
                    >
                        <BookIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium">Lessons</span>
                    </Link>
                    <Link
                        className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        href="#"
                    >
                        <ClipboardIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium">Tests</span>
                    </Link>
                    <Link
                        className="flex flex-col items-center gap-2 rounded-lg bg-gray-100 p-4 transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                        href="#"
                    >
                        <UsersIcon className="h-8 w-8 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium">Students</span>
                    </Link>
                </div>
            </CardContent>
        </Card>
    )
}
