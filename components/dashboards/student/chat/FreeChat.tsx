'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI, UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { studentInsertChatMessage, studentUpdateChatTitle } from '@/actions/dashboard/chatActions'
import { ChatInput, Message } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'

export default function FreeChat ({
    chatId
}: {
    children?: React.ReactNode
    chatId?: number
}) {
    const [conversation, setConversation] = useUIState<typeof FreeChatAI>()
    const { continueFreeChatConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState] = useAIState()

    const {
        scrollRef,
        visibilityRef,
        messagesEndRef,
        isAtBottom,
        scrollToBottom
    } = useScrollAnchor()

    useEffect(() => {
        scrollToBottom()
    }, [conversation, scrollToBottom])

    return (
        <div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4 max-h-[calc(100vh-4rem)]">
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} messagesEndRef={messagesEndRef} />
                ) : (
                    <div className="flex flex-col gap-4">
                        <p className="text-lg">Ask me anything, I'm here to help!</p>
                        <div className="w-full flex flex-col gap-4">
                            <SuggestionsContainer
                                suggestions={[
                                    {
                                        title: 'What is the capital of France?',
                                        description: 'Ask me about anything'
                                    },
                                    {
                                        title: 'What is the weather in London?',
                                        description: 'Ask me about anything'
                                    },
                                    {
                                        title: 'What is the population of New York?',
                                        description: 'Ask me about anything'
                                    }
                                ]}
                                onSuggestionClick={async (suggestion) => {
                                    if (stop) return

                                    setIsLoading(true)

                                    if (aiState.messages.length === 0 && chatId) {
                                        await studentUpdateChatTitle({
                                            chatId,
                                            title: suggestion
                                        })
                                    }

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
                                                    <ViewMarkdown markdown={suggestion} />
                                                </Message>
                                            )
                                        }
                                    ])

                                    if (chatId) {
                                        await studentInsertChatMessage({
                                            chatId,
                                            message: suggestion
                                        })
                                    }

                                    const message = await continueFreeChatConversation(
                                        suggestion
                                    )
                                    setConversation((currentConversation: ClientMessage[]) => [
                                        ...currentConversation,
                                        message
                                    ])
                                    setIsLoading(false)
                                }}
                            />
                        </div>
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div ref={visibilityRef} className="w-full h-px" />
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    callbackFunction={async (input) => {
                        if (stop) return

                        setIsLoading(true)

                        if (aiState.messages.length === 0 && chatId) {
                            await studentUpdateChatTitle({ chatId, title: input.content })
                        }

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
                                        <ViewMarkdown markdown={input.content} />
                                    </Message>
                                )
                            }
                        ])

                        if (chatId) {
                            await studentInsertChatMessage({ chatId, message: input.content })
                        }

                        const message = await continueFreeChatConversation(input.content)
                        setConversation((currentConversation: ClientMessage[]) => [
                            ...currentConversation,
                            message
                        ])
                        setIsLoading(false)
                    }}
                />
            </div>
        </div>
    )
}

interface ChatListProps {
    messages: UIState
    messagesEndRef: React.RefObject<HTMLDivElement>
}

function ChatList ({ messages, messagesEndRef }: ChatListProps) {
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
