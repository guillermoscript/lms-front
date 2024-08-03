'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI, UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { studentCreateNewChatAndRedirect, studentInsertChatMessage, studentUpdateChatTitle } from '@/actions/dashboard/chatActions'
import { ChatInput, Message } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import ChatLoadingSkeleton from './ChatLoadingSkeleton'

async function runUserMessage ({
    input,
    setConversation,
    continueFreeChatConversation,
    chatId,
    addNewChatMessage
}: {
    input: string
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    continueFreeChatConversation: (input: string) => Promise<ClientMessage>
    addNewChatMessage?: boolean
    chatId?: number
}) {
    if (addNewChatMessage) {
        await studentInsertChatMessage({ chatId, message: input })
    }

    const message = await continueFreeChatConversation(input)
    setConversation((currentConversation: ClientMessage[]) => [
        ...currentConversation,
        message
    ])
}

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
    const [aiState, setAiState] = useAIState()

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

    useEffect(() => {
        if (chatId) {
            if (aiState.messages.length === 1) {
                setIsLoading(true)
                runUserMessage({
                    input: aiState.messages[0].content,
                    setConversation,
                    continueFreeChatConversation,
                }).finally(() => setIsLoading(false))
            }
        }
    }, [])

    return (
        <div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4 lg:max-h-[calc(100vh-4rem)]  max-h-[calc(100vh-0.5rem)]">
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

                                    if (!chatId) {
                                        await studentCreateNewChatAndRedirect({
                                            title: suggestion,
                                            chatType: 'free_chat',
                                            insertMessage: true
                                        })
                                    }

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

                                    await runUserMessage({
                                        input: suggestion,
                                        setConversation,
                                        continueFreeChatConversation,
                                        chatId
                                    })

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

                        if (!chatId) {
                            await studentCreateNewChatAndRedirect({
                                title: input.content,
                                chatType: 'free_chat',
                                insertMessage: true
                            })
                        } else {
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

                            await runUserMessage({
                                input: input.content,
                                setConversation,
                                continueFreeChatConversation,
                                chatId,
                                addNewChatMessage: true
                            })
                        }
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
