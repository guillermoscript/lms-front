'use client'

import { useState } from 'react'

import { enrollUserToCourseAction } from '@/actions/dashboard/courseActions'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

export default function EnrollButton ({ courseId }: { courseId: number }) {
    const { toast } = useToast()
    const [loading, setLoading] = useState(false)

    const t = useScopedI18n('NotEnrolledMessage')

    return (
        <Button
            disabled={loading}
            onClick={async () => {
                setLoading(true)
                try {
                    const enrollUser = await enrollUserToCourseAction({
                        courseId
                    })

                    if (enrollUser.status === 'error') {
                        return toast({
                            title: enrollUser.message,
                            description: enrollUser.error,
                            variant: 'destructive'
                        })
                    }

                    toast({
                        title: t(enrollUser.message),
                    })
                } catch (error) {
                    toast({
                        title: t('errorEnrollingUser'),
                        description: error.message,
                        variant: 'destructive'
                    })
                } finally {
                    setLoading(false)
                }
            }
            }
        >
            {loading ? t('enrolling') : t('enrollNow')}
        </Button>
    )
}
