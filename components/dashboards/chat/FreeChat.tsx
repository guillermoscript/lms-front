'use client'
import { generateId } from 'ai'
import { useActions, useAIState, useUIState } from 'ai/rsc'
import { useEffect, useState } from 'react'

import { ClientMessage } from '@/actions/dashboard/AI/ExamPreparationActions'
import { FreeChatAI, UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import {
    studentCreateNewChat,
    studentCreateNewChatAndRedirect,
    studentInsertChatMessage,
    studentUpdateChatTitle,
} from '@/actions/dashboard/chatActions'
import { ChatInput, ChatTextArea, Message } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

import MessageContentWrapper from '../Common/chat/MessageContentWrapper'
import FreeMessageChatEdit from '../student/free-chat/FreeMessageChatEdit'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'

interface RunUserMessageParams {
    input: string
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    continueFreeChatConversation: (input: string) => Promise<ClientMessage>
    addNewChatMessage?: boolean
    chatId?: number
}

const runUserMessage = async ({
    input,
    setConversation,
    continueFreeChatConversation,
    chatId,
    addNewChatMessage,
}: RunUserMessageParams) => {
    if (addNewChatMessage) { await studentInsertChatMessage({ chatId, message: input }) }
    try {
        const message = await continueFreeChatConversation(input)
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation,
            message,
        ])
    } catch (error) {
        console.log(error)
    }
}

interface FreeChatProps {
    children?: React.ReactNode
    chatId?: number
}

const handleCallbackFunction = async ({
    input,
    setIsLoading,
    setConversation,
    continueFreeChatConversation,
    chatId,
    aiState,
    setAiState,
    setId,
    isAtBottom,
    scrollToBottom,
}: {
    input: string
    setIsLoading: (value: boolean) => void
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    continueFreeChatConversation: (input: string, chatId?: number) => Promise<ClientMessage>
    chatId: number | null
    aiState: any
    setAiState: (value: any) => void
    setId: (value: number) => void
    isAtBottom: boolean
    scrollToBottom: () => void
}) => {
    setIsLoading(true)
    if (!chatId && !(/^\d+$/g.test(aiState.chatId))) {
        const data = await studentCreateNewChat({
            title: input,
            chatType: 'free_chat',
        })

        setAiState({
            chatId: data.data.chat_id,
            ...aiState,
        })

        setId(+data.data.chat_id)

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
                        <MessageContentWrapper
                            role="user"
                            view={<ViewMarkdown markdown={input} />}
                            edit={
                                <FreeMessageChatEdit
                                    sender="user"
                                    text={input}
                                    chatId={data.data.chat_id}
                                />
                            }
                        />
                    </Message>
                ),
            },
        ])
        const message = await continueFreeChatConversation(input, data.data.chat_id)
        setConversation((currentConversation: ClientMessage[]) => [
            ...currentConversation,
            message,
        ])
    } else {
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
                        <MessageContentWrapper
                            role="user"
                            view={<ViewMarkdown markdown={input} />}
                            edit={
                                <FreeMessageChatEdit
                                    sender="user"
                                    text={input}
                                    chatId={chatId}
                                />
                            }
                        />
                    </Message>
                ),
            },
        ])
        try {
            await runUserMessage({
                input,
                setConversation,
                continueFreeChatConversation,
                chatId,
                addNewChatMessage: true,
            })
        } catch (error) {
            console.error(error)
        } finally {
            setIsLoading(false)
            if (isAtBottom) {
                scrollToBottom()
            }
        }
    }
    setIsLoading(false)
}

export default function FreeChat({ chatId }: FreeChatProps) {
    const [conversation, setConversation] = useUIState<typeof FreeChatAI>()
    const { continueFreeChatConversation } = useActions()
    const [isLoading, setIsLoading] = useState(false)
    const [id, setId] = useState<number | null>(chatId)
    const [aiState, setAiState] = useAIState()
    const {
        messagesRef,
        scrollRef,
        visibilityRef,
        isAtBottom,
        scrollToBottom,
    } = useScrollAnchor()

    useEffect(() => {
        if (isAtBottom) {
            scrollToBottom()
        }
    }, [conversation, isAtBottom, scrollToBottom])

    return (
        <div ref={scrollRef} className="h-full relative overflow-auto pt-4">
            <div ref={messagesRef} className="pb-[380px] lg:pb-[360px]">
                {conversation.length > 0 ? (
                    <ChatList messages={conversation} />
                ) : (
                    <EmptyState
                        setIsLoading={setIsLoading}
                        continueFreeChatConversation={continueFreeChatConversation}
                        setConversation={setConversation}
                        chatId={chatId}
                    />
                )}
                {isLoading && <ChatLoadingSkeleton />}
                <div ref={visibilityRef} className="w-full h-px" />
            </div>
            <div className='w-full absolute bottom-0'>
                <Tabs defaultValue="simple" className="w-full py-4">
                    <TabsList>
                        <TabsTrigger value="simple">Simple</TabsTrigger>
                        <TabsTrigger value="markdown">Markdown</TabsTrigger>
                    </TabsList>
                    <TabsContent value="markdown">
                        <ChatInput
                            isLoading={isLoading}
                            callbackFunction={async (input) => await handleCallbackFunction({
                                input: input.content,
                                setIsLoading,
                                setConversation,
                                continueFreeChatConversation,
                                chatId: id,
                                aiState,
                                setAiState,
                                setId,
                                isAtBottom,
                                scrollToBottom,
                            })}
                        />
                    </TabsContent>
                    <TabsContent value="simple">
                        <ChatTextArea
                            isLoading={isLoading}
                            callbackFunction={async (input) => await handleCallbackFunction({
                                input: input.content,
                                setIsLoading,
                                setConversation,
                                continueFreeChatConversation,
                                chatId: id,
                                aiState,
                                setAiState,
                                setId,
                                isAtBottom,
                                scrollToBottom,
                            })}
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}

const EmptyState: React.FC<{
    setIsLoading: (value: boolean) => void
    continueFreeChatConversation: (input: string) => Promise<ClientMessage>
    setConversation: (value: React.SetStateAction<ClientMessage[]>) => void
    chatId?: number
}> = ({
    setIsLoading,
    continueFreeChatConversation,
    setConversation,
    chatId,
}) => (
    <div className="flex flex-col gap-4">
        <p className="text-lg">Ask me anything, I'm here to help!</p>
        <div className="w-full flex flex-col gap-4">
            <SuggestionsContainer
                suggestions={[
                    {
                        title: 'What is the capital of France?',
                        description: 'Ask me about anything',
                    },
                    {
                        title: 'What is the weather in London?',
                        description: 'Ask me about anything',
                    },
                    {
                        title: 'What is the population of New York?',
                        description: 'Ask me about anything',
                    },
                ]}
                onSuggestionClick={async (suggestion) => {
                    if (chatId) {
                        await studentUpdateChatTitle({
                            chatId,
                            title: suggestion,
                        })
                    } else {
                        await studentCreateNewChatAndRedirect({
                            title: suggestion,
                            chatType: 'free_chat',
                            insertMessage: true,
                        })
                    }
                    setConversation((currentConversation) => [
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
                            ),
                        },
                    ])
                    await runUserMessage({
                        input: suggestion,
                        setConversation,
                        continueFreeChatConversation,
                        chatId,
                    })
                    setIsLoading(false)
                }}
            />
        </div>
    </div>
)

const ChatList: React.FC<{ messages: UIState }> = ({ messages }) => (
    <div className="relative px-4">
        {messages.map((message, index) => (
            <div key={index} className="flex flex-col gap-2">
                {message.display}
            </div>
        ))}
    </div>
)
