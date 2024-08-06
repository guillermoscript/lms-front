'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import {
    AI,
    ClientMessage,
    UIState,
} from '@/actions/dashboard/AI/ExamPreparationActions'
import {
    studentInsertChatMessage,
    studentUpdateChatTitle,
} from '@/actions/dashboard/chatActions'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import { ChatInput } from '../Common/chat/chat'
import Message from '../Common/chat/Message'
import SuggestionsContainer from '../Common/chat/SuggestionsContainer'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import ExamPrepSetup from './tour/ExamPrepSetup'

export default function ExamPrepChat({ chatId }: { chatId?: number }) {
    const [conversation, setConversation] = useUIState<typeof AI>()
    const { continueConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [stop, setStop] = useState(false)
    const [aiState] = useAIState()
    const lastMessage = aiState.messages
        ? aiState.messages[aiState.messages.length - 1]
        : null
    const [hideInput, setHideInput] = useState<boolean>(false)

    const {
        scrollRef,
        visibilityRef,
        messagesRef: messagesEndRef,
        isAtBottom,
        scrollToBottom,
    } = useScrollAnchor()

    useEffect(() => {
        if (!lastMessage) return
        if (lastMessage.role === 'tool') {
            const [toolCalled] = lastMessage.content
            const isShowExamForm = toolCalled.toolName === 'showExamForm'
            setHideInput(isShowExamForm)
        }
    }, [lastMessage])

    useEffect(() => {
        scrollToBottom()
    }, [conversation, scrollToBottom])

    return (
        <div>
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4"
            >
                {conversation.length ? (
                    <ChatList
                        messages={conversation}
                        messagesEndRef={messagesEndRef}
                    />
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap gap-4 w-full items-center">
                            <h1 className="text-2xl">
                                Exam Preparation Chat, Ask me anything, I'm here
                                to help!
                            </h1>
                            <ExamPrepSetup />
                        </div>
                        <SuggestionsContainer
                            suggestions={[
                                {
                                    title: 'help me creating a basic python exam form',
                                    description:
                                        'This will help you to create a basic python exam form',
                                },
                                {
                                    title: 'help me creating a basic Javascipt exam form',
                                    description:
                                        'This will help you to create a basic Javascript exam form',
                                },
                                {
                                    title: 'help me creating a basic HTML exam form',
                                    description:
                                        'This will help you to create a basic HTML exam form',
                                },
                            ]}
                            onSuggestionClick={async (suggestion) => {
                                setIsLoading(true)

                                setConversation(
                                    (currentConversation: ClientMessage[]) => [
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
                                                    <ViewMarkdown
                                                        markdown={
                                                            message.content
                                                        }
                                                    />
                                                </Message>
                                            ),
                                        },
                                    ]
                                )

                                const message = await continueConversation(
                                    suggestion
                                )
                                setConversation(
                                    (currentConversation: ClientMessage[]) => [
                                        ...currentConversation,
                                        message,
                                    ]
                                )
                                setIsLoading(false)
                            }}
                        />
                        <div className="flex-1 flex items-center justify-center my-4">
                            <p className="text-gray-400">
                                Please Know that LLMs can make mistakes. Verify
                                important information and always ask for help if
                                you need it.
                            </p>
                        </div>
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div ref={visibilityRef} className="w-full h-px" />
            </div>

            {!hideInput && (
                <ChatInput
                    isLoading={isLoading}
                    stop={() => setStop(true)}
                    isTemplatePresent={true}
                    callbackFunction={async (input) => {
                        if (stop) return

                        setIsLoading(true)

                        if (aiState.messages.length === 0 && chatId) {
                            await studentUpdateChatTitle({
                                chatId,
                                title: input.content,
                            })
                        }

                        setConversation(
                            (currentConversation: ClientMessage[]) => [
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
                                            <ViewMarkdown
                                                markdown={input.content}
                                            />
                                        </Message>
                                    ),
                                },
                            ]
                        )

                        if (chatId) {
                            await studentInsertChatMessage({
                                chatId,
                                message: input.content,
                            })
                        }

                        const message = await continueConversation(
                            input.content
                        )
                        setConversation(
                            (currentConversation: ClientMessage[]) => [
                                ...currentConversation,
                                message,
                            ]
                        )
                        setIsLoading(false)
                    }}
                />
            )}
        </div>
    )
}

interface ChatListProps {
    messages: UIState
    messagesEndRef: React.RefObject<HTMLDivElement>
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
