'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import { studentInsertChatMessage } from '@/actions/dashboard/chatActions'
import { AI, ClientMessage, UIState } from '@/actions/dashboard/ExamPreparationActions'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Skeleton } from '@/components/ui/skeleton'

import { ChatInput } from '../../Common/chat/chat'
import Message from '../../Common/chat/Message'
import SuggestionsContainer from '../../Common/chat/SuggestionsContainer'

export default function ExamPrepChat ({
    children,
    chatId
}: {
    children?: React.ReactNode
    chatId?: number
}) {
    const [conversation, setConversation] = useUIState<typeof AI>()
    const { continueConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState] = useAIState()
    const lastMessage = aiState.messages ? aiState.messages[aiState.messages.length - 1] : null
    const [hideInput, setHideInput] = useState<boolean>(false)

    useEffect(() => {
        if (!lastMessage) return
        if (lastMessage.role === 'tool') {
            const [toolCalled] = lastMessage.content
            const isShowExamnForm = toolCalled.toolName === 'showExamnForm'
            setHideInput(isShowExamnForm)
        }
    }
    , [lastMessage])

    return (
        <div>
            <h1 className="text-2xl font-bold p-4">Exam Preparation Chat</h1>
            {conversation.length === 0 && (
                <SuggestionsContainer
                    suggestions={[
                        {
                            title: 'help me creating a basic python examn form',
                            description:
                  'This will help you to create a basic python exam form'
                        },
                        {
                            title: 'help me creating a basic Javascipt examn form',
                            description:
                  'This will help you to create a basic Javascript exam form'
                        },
                        {
                            title: 'help me creating a basic HTML examn form',
                            description:
                  'This will help you to create a basic HTML exam form'
                        }
                    ]}
                    onSuggestionClick={async (suggestion) => {
                        setIsLoading(true)

                        setConversation((currentConversation: ClientMessage[]) => [
                            ...currentConversation,
                            {
                                id: generateId(),
                                role: 'user',
                                display: (

                                    <Message
                                        sender={message.role}
                                        time={new Date().toDateString()}
                                        isUser={true}
                                    >
                                        <ViewMarkdown markdown={message.content} />
                                    </Message>
                                )
                            }
                        ])

                        const message = await continueConversation(suggestion)
                        setConversation((currentConversation: ClientMessage[]) => [
                            ...currentConversation,
                            message
                        ])
                        setIsLoading(false)
                    }}
                />
            )}

            <div className="flex-1 overflow-y-auto p-4 ">
                {conversation.length ? (
                    <ChatList messages={conversation} />
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-gray-400">No messages yet</p>
                    </div>
                )}

                {isLoading && (
                    <div className="space-y-2 w-full">
                        <Skeleton className="h-6 rounded mr-14" />
                        <div className="grid grid-cols-3 gap-4">
                            <Skeleton className="h-6 rounded col-span-2" />
                            <Skeleton className="h-6 rounded col-span-1" />
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            <Skeleton className="h-6 rounded col-span-1" />
                            <Skeleton className="h-6 rounded col-span-2" />
                            <Skeleton className="h-6 rounded col-span-1 mr-4" />
                        </div>
                        <Skeleton className="h-6 rounded" />
                    </div>
                )}
            </div>
            {!hideInput && (
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    callbackFunction={async (input) => {
                        if (stop) return

                        setIsLoading(true)

                        if (chatId) {
                            const inserUserMessage = await studentInsertChatMessage({
                                chatId,
                                message: input.content
                            })
                            console.log(inserUserMessage)
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

                        const message = await continueConversation(input.content)

                        setConversation((currentConversation: ClientMessage[]) => [
                            ...currentConversation,
                            message
                        ])
                        setIsLoading(false)
                    }}
                />
            )}
        </div>
    )
}
interface ChatList {
    messages: UIState
}

function ChatList ({ messages }: ChatList) {
    if (!messages.length) {
        return null
    }

    return (
        <>
            {messages.map((message, index) => (
                <div key={index} className="flex flex-col gap-2">
                    {message.display}
                </div>
            ))}
        </>
    )
}
