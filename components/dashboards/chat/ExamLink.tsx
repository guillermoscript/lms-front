'use client'
import { useState } from 'react'

import { studentCreateNewChatAndRedirect } from '@/actions/dashboard/chatActions'
import { useScopedI18n } from '@/app/locales/client'
import { Button } from '@/components/ui/button'
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExamLink () {
    const [isLoading, setIsLoading] = useState(false)
    const t = useScopedI18n('ExamLink')

    return (
        <HoverCard>
            <HoverCardTrigger asChild>
                { isLoading ? (
                    <Skeleton className="w-24 h-8" />
                ) : (
                    <Button

                        id='quiz-me'
                        onClick={async () => {
                            setIsLoading(true)
                            try {
                                const response = await studentCreateNewChatAndRedirect({
                                    chatType: 'exam_prep',
                                    title: 'Exam Preparation'
                                })
                                console.log(response)
                            } catch (error) {
                                console.error(error)
                            } finally {
                                setIsLoading(false)
                            }
                        }}
                        variant="outline"
                    >
                        {t('title')}
                    </Button>
                )}
            </HoverCardTrigger>
            <HoverCardContent>
                {t('description')}
            </HoverCardContent>
        </HoverCard>
    )
}
