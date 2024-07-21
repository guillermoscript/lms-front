import Link from 'next/link'

import { buttonVariants } from '@/components/ui/button'

export default function NoCourseAndSubAlert() {
    return (
        <div className="bg-white rounded-lg shadow-md p-6 dark:bg-gray-950 flex flex-col items-center justify-center text-center gap-6">
            <div className="max-w-md">
                <h2 className="text-3xl font-bold">Unlock Your Learning Journey</h2>
                <p className="text-gray-500 dark:text-gray-400 mt-2">
                To access our full course catalog and learning resources, please subscribe to one of our plans or
                purchase an individual course.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
                <Link
                    href="/plans"
                    className={buttonVariants({ variant: 'default' })}
                >
                View Plans
                </Link>
                <Link
                    href='/store'
                    className={buttonVariants({ variant: 'secondary' })}
                >
                Browse Courses
                </Link>
            </div>
        </div>
    )
}
