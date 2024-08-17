'use client'

import { BookOpenTextIcon, PencilLineIcon } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { enrollUserToCourseAction } from '@/actions/dashboard/courseActions'
import { buttonVariants } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/utils'

export default function LinkCourseCard({
    courseId,
    noEnroll,
}) {
    const router = useRouter()
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)

    const handleClick = async (e, path) => {
        e.preventDefault()
        if (!noEnroll) {
            router.push(path)
        } else {
            try {
                const enrollUser = await enrollUserToCourseAction({ courseId })

                if (enrollUser.status === 'error') {
                    return toast({
                        title: enrollUser.message,
                        description: enrollUser.error,
                        variant: 'destructive'
                    })
                }

                toast({ title: enrollUser.message })
                router.push(path)
            } catch (error) {
                toast({
                    title: 'Error enrolling user',
                    description: error.message,
                    variant: 'destructive'
                })
            } finally {
                setLoading(false)
            }
        }
    }

    return (
        <>
            <Link
                className={cn(buttonVariants({ variant: 'default' }), 'flex items-center justify-center gap-2')}
                href={`/dashboard/student/courses/${courseId}/lessons`}
                onClick={async (e) => await handleClick(e, `/dashboard/student/courses/${courseId}/lessons`)}
            >
                <BookOpenTextIcon className="h-6 w-6" />
                {loading ? 'Loading...' : noEnroll ? 'Enroll & View Lessons' : 'View Lessons'}
            </Link>
            <Link
                className={cn(buttonVariants({ variant: 'secondary' }), 'flex items-center justify-center gap-2')}
                href={`/dashboard/student/courses/${courseId}/exams`}
                onClick={async (e) => await handleClick(e, `/dashboard/student/courses/${courseId}/exams`)}
            >
                <PencilLineIcon className="h-6 w-6" />
                {loading ? 'Loading...' : noEnroll ? 'Enroll & View Exams' : 'View Exams'}
            </Link>
        </>
    )
}
