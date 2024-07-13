'use client'
import { useState } from 'react'

import { studentCreateNewChatAndRedirect } from '@/actions/dashboard/chatActions'
import { Button } from '@/components/ui/button'
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExamLink () {
    const [isLoading, setIsLoading] = useState(false)

    return (
        <HoverCard>
            <HoverCardTrigger asChild>
                { isLoading ? (
                    <Skeleton className="w-24 h-8" />
                ) : (
                    <Button
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
                        Quiz Me
                    </Button>
                )}
            </HoverCardTrigger>
            <HoverCardContent>
                This is where you can prepare for your exams, the AI will create Forms for you to fill out and get feedback on your answers.
            </HoverCardContent>
        </HoverCard>
    )
}
