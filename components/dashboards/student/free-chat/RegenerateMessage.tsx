'use client'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI } from '@/actions/dashboard/AI/FreeChatPreparation'
import { studentDeleteAikMessage } from '@/actions/dashboard/chatActions'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { Button } from '@/components/ui/button'

import { ViewMode } from '../../Common/chat/MessageContentWrapper'

export default function RegenerateMessageFreeChat({
    message,
    viewMode,
    setViewMode,
    chatId
}: {
    message: string
    viewMode?: ViewMode
    setViewMode?: React.Dispatch<React.SetStateAction<ViewMode>>
    chatId: number
}) {
    const [conversation, setConversation] = useUIState<typeof FreeChatAI>()
    const { continueFreeChatConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [id, setId] = useState<number | null>(chatId)
    const [aiState, setAiState] = useAIState()

    async function editMessageFun() {
        const messageIndex = aiState.messages.findIndex(
            (val) => val.content === message
        )

        if (messageIndex === -1) {
            console.error('Message not found')
            setIsLoading(false)
            return
        }

        const messageBefore = aiState.messages[messageIndex - 1]
        const messageVal = aiState.messages[messageIndex]

        const messageId = /^[0-9]+$/g.test(messageVal.id)
            ? Number(messageVal.id)
            : undefined

        console.log(messageId)

        const res = await studentDeleteAikMessage({
            lessonId: aiState.lessonId,
            message: {
                content: message,
                role: 'assistant',
                messageId,
            },
        })

        if (res.status === 'error') {
            setIsLoading(false)
            return
        }

        // Remove the current message and all subsequent messages
        setAiState({
            messages: aiState.messages.slice(0, messageIndex),
        })

        // replace the current message with the message before and remove all the subsequent messages
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation.slice(0, currentConversation.length - 1),
        ])

        // Regenerate the message
        const aiRes = await continueFreeChatConversation(messageBefore.content, messageBefore.id, messageVal.id)

        // Add the new message to the aiState
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation,
            aiRes,
        ])
        setIsLoading(false)
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
