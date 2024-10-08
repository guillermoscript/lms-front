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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import { ChatInput, ChatTextArea } from '../Common/chat/chat'
import Message from '../Common/chat/Message'
import MarkdownEditorTour from '../Common/tour/MarkdownEditorTour'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import EmptyChatState from './EmptyChatState'

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

    const handleInput = async (input: any) => {
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

        const message = await continueConversation(input.content)
        setConversation(
            (currentConversation: ClientMessage[]) => [
                ...currentConversation,
                message,
            ]
        )
        setIsLoading(false)
    }

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
                        <EmptyChatState
                            onSuggestionClick={ async (suggestion) => {
                                setIsLoading(true)

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
                                                        markdown={
                                                            suggestion
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
                    </div>
                )}

                {isLoading && <ChatLoadingSkeleton />}
                <div ref={visibilityRef} className="w-full h-px" />
            </div>

            {!hideInput && (
                <>
                    <Tabs defaultValue="markdown" className="w-full py-4">
                        <div className="flex gap-4">
                            <TabsList
                                id='tabs-list'
                                className='gap-4'
                            >
                                <TabsTrigger
                                    id='simple-tab'
                                    value="simple"
                                >
                                    Simple
                                </TabsTrigger>
                                <TabsTrigger
                                    id='markdown-tab'
                                    value="markdown"
                                >
                                    Markdown
                                </TabsTrigger>
                            </TabsList>
                            <MarkdownEditorTour />
                        </div>
                        <TabsContent
                            id='markdown-content'
                            value="markdown"
                        >
                            <ChatInput
                                isLoading={isLoading}
                                stop={() => setStop(true)}
                                callbackFunction={handleInput}
                                isTemplatePresent={true}
                            />
                        </TabsContent>
                        <TabsContent
                            id='simple-content'
                            value="simple"
                        >
                            <ChatTextArea
                                isLoading={isLoading}
                                stop={() => setStop(true)}
                                callbackFunction={handleInput}
                            />
                        </TabsContent>
                    </Tabs>
                </>
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
