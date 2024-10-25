'use client'
import { CheckCheck, Loader } from 'lucide-react'
import React, { useState } from 'react'
import { toast } from 'sonner'

import { markLessonAsCompleted } from '@/actions/dashboard/lessonsAction'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'

interface MarkLessonsAsCompletedProps {
    lessonId: string
    isLessonAiTaskCompleted: boolean
}

const MarkLessonsAsCompleted: React.FC<MarkLessonsAsCompletedProps> = ({
    lessonId,
    isLessonAiTaskCompleted,
}) => {
    const t = useScopedI18n('MarkLessonsAsCompleted')
    const [isCompleted, setIsCompleted] = useState(isLessonAiTaskCompleted)
    const [loading, setLoading] = useState(false)

    async function handleComplete() {
        setLoading(true)
        try {
            const response = await markLessonAsCompleted(+lessonId)
            if (response.error) {
                toast.error(t('error'))
            } else {
                toast.success(t('success'))
                setIsCompleted(true)
            }
        } catch (error) {
            console.error(error)
            toast.error(t('error'))
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            {isCompleted ? (
                <div className="flex items-center space-x-2">
                    <p>{t('lessonCompleted')}</p> <CheckCheck />
                </div>
            ) : (
                <Button disabled={loading} onClick={handleComplete}>
                    {loading ? (
                        <Loader className=" animate-spin" />
                    ) : (
                        t('markAsCompleted')
                    )}
                </Button>
            )}
        </div>
    )
}

export default MarkLessonsAsCompleted
