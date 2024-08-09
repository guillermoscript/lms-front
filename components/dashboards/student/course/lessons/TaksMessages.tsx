'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useRef, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { TaskAiActions } from '@/actions/dashboard/AI/TaskAiActions'
import { studentSubmitAiTaskMessage } from '@/actions/dashboard/lessonsAction'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import { ChatInput, ChatTextArea, SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import Message from '@/components/dashboards/Common/chat/Message'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useNoCopy from '@/utils/hooks/useNoCopy'

async function handleSubmitMessage({
    input,
    setConversation,
    setIsLoading,
    stop,
    continueTaskAiConversation,
    lessonId,
}: {
    input: string
    setConversation: (value: any) => void
    setIsLoading: (value: boolean) => void
    stop: boolean
    continueTaskAiConversation: (content: string) => Promise<ClientMessage>
    lessonId: number
}) {
    if (stop) return

    setIsLoading(true)

    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        {
            id: generateId(),
            role: 'user',
            display: (
                <Message
                    sender={'user'}
                    time={new Date().toDateString()}
                    isUser={true}
                >
                    <ViewMarkdown markdown={input} />
                </Message>
            ),
        },
    ])

    const res = await studentSubmitAiTaskMessage({
        lessonId,
        message: {
            content: input,
            role: 'user',
        },
    })

    const message = await continueTaskAiConversation(input)
    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        message,
    ])
    setIsLoading(false)
}

export default function TaksMessages({
    lessonId,
    isLessonAiTaskCompleted,
}: {
    lessonId?: number
    isLessonAiTaskCompleted: boolean
}) {
    const [conversation, setConversation] = useUIState<typeof TaskAiActions>()
    const { continueTaskAiConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState] = useAIState()

    const isLastMessageFromMakeUserAssigmentCompleted =
        aiState.messages[aiState.messages.length - 1].role === 'tool' &&
        aiState.messages[aiState.messages.length - 1].content[0].toolName ===
            'makeUserAssigmentCompleted'

    return (
        <div className="w-full px-1">
            <div className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4">
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-lg">Complete your task</p>
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div className="w-full h-px" />
                {!isLastMessageFromMakeUserAssigmentCompleted &&
                    !isLessonAiTaskCompleted && (
                    <>
                        <Tabs defaultValue="simple" className="w-full py-4">
                            <TabsList>
                                <TabsTrigger value="simple">Simple</TabsTrigger>
                                <TabsTrigger value="markdown">Markdown</TabsTrigger>
                            </TabsList>
                            <TabsContent value="markdown">
                                <ChatInput
                                    isLoading={isLoading}
                                    stop={() => setStop(true)}
                                    callbackFunction={async (input) => {
                                        handleSubmitMessage({
                                            input: input.content,
                                            setIsLoading,
                                            setConversation,
                                            continueTaskAiConversation,
                                            stop,
                                            lessonId,
                                        })
                                    }}
                                />
                            </TabsContent>
                            <TabsContent value="simple">
                                <ChatTextArea
                                    isLoading={isLoading}
                                    stop={() => setStop(true)}
                                    callbackFunction={async (input) => {
                                        handleSubmitMessage({
                                            input: input.content,
                                            setIsLoading,
                                            setConversation,
                                            continueTaskAiConversation,
                                            stop,
                                            lessonId,
                                        })
                                    }}
                                />
                            </TabsContent>
                        </Tabs>
                    </>
                )}

                {isLessonAiTaskCompleted && (
                    <SuccessMessage
                        status="success"
                        message="Assignment marked as completed."
                    />
                )}
            </div>
        </div>
    )
}

interface ChatListProps {
    messages: UIState
    messagesEndRef?: React.RefObject<HTMLDivElement>
}

function ChatList({ messages, messagesEndRef }: ChatListProps) {
    const contentRef = useRef(null)

    useNoCopy(contentRef)

    return (
        <div ref={contentRef} className="relative">
            {messages.map((message, index) => (
                <div key={index} className="flex flex-col gap-2">
                    {message.display}
                </div>
            ))}
            <div ref={messagesEndRef} className="h-px" />
        </div>
    )
}
