'use client'

import {
    Bell,
    Calculator,
    CreditCard,
    Smile,
    User
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator
} from '@/components/ui/command'
import { useToast } from '@/components/ui/use-toast'
import { createClient } from '@/utils/supabase/client'
import { getClientUserRole } from '@/utils/supabase/getClientUserRole'

export function CommandDialogComponent () {
    const [open, setOpen] = useState(false)
    const [userRole, setUserRole] = useState('' as string)
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const [courses, setCourses] = useState([])
    const [lessons, setLessons] = useState([])

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'j' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    useEffect(() => {
        async function fetchUserRole () {
            const response = await getClientUserRole()
            setUserRole(response)
        }

        fetchUserRole()
    }, [])

    useEffect(() => {
        async function fetchCourses () {
            setLoading(true)
            try {
                const supabase = createClient()
                const { data: courses, error } = await supabase.from('courses').select('*').limit(5)

                if (error) {
                    console.error(error)
                    return null
                }

                setCourses(courses)
            } catch (error) {
                toast({
                    title: 'Error fetching courses',
                    description: error.message,
                    variant: 'destructive'
                })
            } finally {
                setLoading(false)
            }
        }

        fetchCourses()
    }
    , [userRole])

    return (
        <>
            <div className="text-sm text-muted-foreground">
                <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    <span className="text-xs">⌘</span>J
                </kbd>
            </div>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Type a command or search..." />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Suggestions">
                        <CommandItem>
                            <Link
                                className='flex items-center gap-2'
                                href="/dashboard/notifications"
                            >
                                <Bell className="mr-2 h-4 w-4" />
                                <span>Notifications</span>
                            </Link>
                        </CommandItem>
                        <CommandItem>
                            <Smile className="mr-2 h-4 w-4" />
                            <span>Search Emoji</span>
                        </CommandItem>
                        <CommandItem>
                            <Calculator className="mr-2 h-4 w-4" />
                            <span>Calculator</span>
                        </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                    <CommandGroup heading="Settings">
                        <CommandItem>
                            <Link
                                className='flex items-center gap-2'
                                href={`/dashboard/${userRole}/profile`}
                            >
                                <User className="mr-2 h-4 w-4" />
                                <span>Profile</span>
                            </Link>
                        </CommandItem>
                        <CommandItem>
                            <Link
                                className='flex items-center gap-2'
                                href={`/dashboard/${userRole}/profile`}
                            >
                                <CreditCard className="mr-2 h-4 w-4" />
                                <span>Billing</span>
                            </Link>
                        </CommandItem>
                    </CommandGroup>
                    <CommandGroup heading="Courses">
                        {loading
                            ? <>Loading...</>
                            : courses.map((course: any) => (
                                <CommandItem key={course.course_id}>
                                    <Link
                                        className='flex items-center gap-2'
                                        href={`/dashboard/${userRole}/courses/${course.course_id}`}
                                    >
                                        <span>{course.title}</span>
                                    </Link>
                                </CommandItem>
                            ))
                        }

                    </CommandGroup>

                </CommandList>
            </CommandDialog>
        </>
    )
}
