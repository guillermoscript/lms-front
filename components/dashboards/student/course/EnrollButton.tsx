'use client'

import { useState } from 'react'

import { enrollUserToCourseAction } from '@/actions/dashboard/courseActions'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export default function EnrollButton ({
    courseId
}: {
    courseId: number
}) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault()
                async () => {
                    setLoading(true)
                    try {
                        const enrollUser = await enrollUserToCourseAction({
                            courseId
                        })

                        console.log(enrollUser)

                        if (enrollUser.status === 'error') {
                            return toast({
                                title: enrollUser.message,
                                description: enrollUser.error,
                                variant: 'destructive'
                            })
                        }

                        toast({
                            title: enrollUser.message
                        })
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
            }}
        >
            <Button
                disabled={loading}
            >
                {loading ? 'Enrolling...' : 'Enroll Now'}
            </Button>
        </form>
    )
}
