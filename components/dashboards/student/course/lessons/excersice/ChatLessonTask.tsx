'use client'
import { Message } from 'ai'
import { useChat } from '@ai-sdk/react'
import { useState } from 'react'
import { toast } from 'sonner'

import { actionButtonsActionLessons, studentSubmitAiTaskMessage } from '@/actions/dashboard/lessonsAction'
import ChatInput from '@/components/dashboards/chat/Chatsv2/ChatInput'
import ChatMessages from '@/components/dashboards/chat/Chatsv2/ChatMessages'
import ApprovalButton from '@/components/dashboards/Common/chat/ApprovalButton'
import { SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import useApprovalHandler from '@/components/dashboards/Common/chat/hooks/useApprovalHandler'
import NotApprovedMessage from '@/components/dashboards/Common/chat/NotApprovedMessage'

export default function ChatLessonTask({
    lessonId,
    isLessonAiTaskCompleted,
    chatMessages,
}: {
    lessonId: number
    isLessonAiTaskCompleted: boolean
    chatMessages?: Message[]
}) {
    const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setInput, setMessages } = useChat({
        initialMessages: chatMessages,
        maxSteps: 2,
        api: '/api/lessons/ai-task',
        body: {
            lessonId
        },
        onToolCall({ toolCall, }) {
            if (toolCall.toolName === 'makeUserAssignmentCompleted') {
                // set isCompleted to true
                setIsCompleted(true)
            }
        },
    })

    const [isCompleted, setIsCompleted] = useState(isLessonAiTaskCompleted)
    const [isNotApproved, setIsNotApproved] = useState(false)
    const [notApprovedMessage, setNotApprovedMessage] = useState('')

    const { isLoading: isApprovalLoading, handleCheckAnswer } = useApprovalHandler({
        exerciseId: lessonId,
        messages,
        setIsCompleted,
        setIsNotApproved,
        setNotApprovedMessage,
        t: (key) => key,
        callback: async () => {
            try {
                const res = await actionButtonsActionLessons({
                    lessonId,
                    messages: messages.map((m) => ({
                        id: m.id,
                        content: m.content,
                        role: m.role,
                    })),
                })
                if (res.error) {
                    toast.error('errorLoadingExercise')
                }
                if (res.data.isApproved === false) {
                    toast.error('errorExerciseNotApproved')
                    setIsNotApproved(true)
                    setNotApprovedMessage(res.data.toolResult)
                }
                if (res.data.isApproved) {
                    setIsCompleted(true)
                }
            } catch (error) {
                console.error(error)
                toast.error('errorLoadingExercise')
                setIsNotApproved(true)
            }
        },
    })

    return (
        <>
            <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center pt-8 justify-between">
                <div className="flex flex-1 flex-col items-center justify-center space-y-6 w-full overflow-hidden">
                    {messages.length === 1 && messages[0].role === 'system' && (
                        <div className="prompt-section">
                            <p>Please enter your message to get started.</p>
                        </div>
                    )}
                    <ChatMessages
                        reload={async (messageToEdit) => {
                            setInput(messageToEdit.content)
                            const messageIndex = messages.findIndex(m => m.id === messageToEdit.id)
                            const newMessages = messages.slice(0, messageIndex)
                            setMessages(newMessages)

                            reload()
                            setInput('')
                        }}
                        messages={messages}
                        isLoading={isLoading}
                        disabled={isLessonAiTaskCompleted}
                    />
                </div>
                <div className="w-full p-4">
                    {!isLessonAiTaskCompleted && (
                        <ChatInput
                            input={input}
                            disabled={isLoading}
                            handleInputChange={handleInputChange}
                            handleSubmit={async (e) => {
                                handleSubmit(e)
                                const res = await studentSubmitAiTaskMessage({
                                    lessonId,
                                    message: {
                                        content: input,
                                        role: 'user',
                                    },
                                })

                                console.log(res)
                            }}
                        />
                    )}
                </div>
            </div>
            {isNotApproved && (
                <NotApprovedMessage
                    message={notApprovedMessage}
                    onClose={() => {
                        setIsNotApproved(false)
                        setNotApprovedMessage('')
                    }}
                />
            )}

            {messages.length > 1 && !isCompleted && (
                <div className="flex justify-center">
                    <ApprovalButton
                        isLoading={isApprovalLoading}
                        isCompleted={isCompleted}
                        onCheckAnswer={handleCheckAnswer}
                        disabled={isLoading || isCompleted}
                    >
                        checkAnswer
                    </ApprovalButton>
                </div>
            )}

            {isCompleted && (
                <SuccessMessage
                    status="Completed"
                    message="Assignment marked as completed."
                />
            )}
        </>
    )
}
