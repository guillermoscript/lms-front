'use client'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { TaskAiActions } from '@/actions/dashboard/AI/TaskAiActions'
import { studentDeleteAiTaskMessage } from '@/actions/dashboard/lessonsAction'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { Button } from '@/components/ui/button'

export default function RegenerateMessage({
    message,
    viewMode,
    setViewMode,
}: {
    message: string
    viewMode?: 'view' | 'edit'
    setViewMode?: React.Dispatch<React.SetStateAction<'view' | 'edit'>>
}) {
    const [aiState, setAiState] = useAIState()
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [conversation, setConversation] = useUIState<typeof TaskAiActions>()
    const { continueTaskAiConversation } = useActions()

    console.log(aiState)

    async function editMessageFun() {
        // search for the message in the aiState

        console.log(aiState)

        const messageIndex = aiState.messages.findIndex(
            (val) => val.content === message
        )

        // get the message before the message
        const messageBefore = aiState.messages[messageIndex - 1]

        const messageVal = aiState.messages[messageIndex]

        console.log(messageVal)

        console.log(message)

        const messageId = /^[0-9]+$/g.test(messageVal.id)
            ? Number(messageVal.id)
            : undefined

        console.log(messageId)

        const res = await studentDeleteAiTaskMessage({
            lessonId: aiState.lessonId,
            message: {
                content: message,
                role: 'assistant',
                messageId,
            },
        })

        console.log(res)

        if (res.status === 'error') {
            setIsLoading(false)
            return
        }

        // remove all the messages after the current message
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation.slice(0, messageIndex),
        ])

        // remove all the messages after the current message
        setAiState({
            ...aiState,
            messages: aiState.messages.slice(0, messageIndex),
        })

        console.log(messageBefore)

        // regenerate the message
        const aiRes = await continueTaskAiConversation(messageBefore.content)

        // add the new message to the aiState
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation,
            aiRes,
        ])

        console.log(conversation)

        setIsLoading(false)
        setViewMode('view')
    }

    return isLoading ? (
        <ChatLoadingSkeleton />
    ) : (
        <div className="flex flex-col items-center space-y-4">
            <h4 className="text-lg">
                Are you sure you want to regenerate the AI response?
            </h4>
            <div className="flex items-center justify-center gap-4">
                <Button
                    onClick={() => {
                        setIsLoading(true)
                        editMessageFun()
                    }}
                >
                    Yes
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => {
                        setViewMode('view')
                    }}
                >
                    No
                </Button>
            </div>
        </div>
    )
}
