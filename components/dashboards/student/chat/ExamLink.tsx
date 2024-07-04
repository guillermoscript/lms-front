'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { studentCreateNewChat } from '@/actions/dashboard/chatActions'
import { Button } from '@/components/ui/button'
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger
} from '@/components/ui/hover-card'
import { Skeleton } from '@/components/ui/skeleton'

export default function ExamLink () {
    const router = useRouter()
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
                                const response = await studentCreateNewChat({
                                    chatType: 'exam_prep',
                                    title: 'Exam Preparation'
                                })

                                if (response.status === 'success') {
                                    router.push(`/dashboard/student/chat/exam-prep/${response.data.chat_id}`)
                                }
                            } catch (error) {
                                console.error(error)
                            } finally {
                                setIsLoading(false)
                            }
                        }}
                        variant="outline"
                    >Prepare for exams</Button>
                )}
            </HoverCardTrigger>
            <HoverCardContent>Prepare for your exams</HoverCardContent>
        </HoverCard>
    )
}
