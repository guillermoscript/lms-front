'use client'
import { generateId } from 'ai'
import { useActions, useUIState } from 'ai/rsc'
import { useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { TaskSandboxActions } from '@/actions/dashboard/AI/TaskSandboxActions'
import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import {
    ChatInput,
    ChatTextArea,
} from '@/components/dashboards/Common/chat/chat'
import Message from '@/components/dashboards/Common/chat/Message'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const handleSubmit = async ({
    input,
    setIsLoading,
    setConversation,
    continueTaskAiSandBoxConversation,
    stop,
}: {
    input: string
    setIsLoading: (value: boolean) => void
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    continueTaskAiSandBoxConversation: (input: string) => Promise<ClientMessage>
    stop: boolean
}) => {
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

    const message = await continueTaskAiSandBoxConversation(input)
    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        message,
    ])
    setIsLoading(false)
}

export default function TaskSandboxMessage() {
    const [conversation, setConversation] = useUIState<typeof TaskSandboxActions>()
    const { continueTaskAiSandBoxConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)

    // const isLastMessageFromMakeUserAssigmentCompleted =
    //     aiState?.messages[aiState?.messages.length - 1].role === 'tool' &&
    //     aiState?.messages[aiState?.messages.length - 1].content[0].toolName ===
    //         'makeUserAssigmentCompleted'

    return (
        <div className="w-full sm:max-w-screen-sm md:max-w-screen-md lg:max-w-screen-2xl mx-auto px-1">
            <div className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4 lg:max-h-[calc(100vh-4rem)]  max-h-[calc(100vh-0.5rem)]">
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-lg">Complete your task</p>
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div className="w-full h-px" />
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
                                handleSubmit({
                                    input: input.content,
                                    setIsLoading,
                                    setConversation,
                                    continueTaskAiSandBoxConversation,
                                    stop,
                                })
                            }}
                        />
                    </TabsContent>
                    <TabsContent value="simple">
                        <ChatTextArea
                            isLoading={isLoading}
                            stop={() => setStop(true)}
                            callbackFunction={async (input) => {
                                handleSubmit({
                                    input: input.content,
                                    setIsLoading,
                                    setConversation,
                                    continueTaskAiSandBoxConversation,
                                    stop,
                                })
                            }}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

interface ChatListProps {
    messages: any[]
    messagesEndRef?: React.RefObject<HTMLDivElement>
}

function ChatList({ messages, messagesEndRef }: ChatListProps) {
    return (
        <div className="relative">
            {messages.map((message, index) => (
                <div key={index} className="flex flex-col gap-2">
                    {message.display}
                </div>
            ))}
            <div ref={messagesEndRef} className="h-px" />
        </div>
    )
}
