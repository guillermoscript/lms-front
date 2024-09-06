'use server'
import 'server-only'

import { google } from '@ai-sdk/google'
import { generateId } from 'ai'
import { createAI, getMutableAIState, streamUI } from 'ai/rsc'
import dayjs from 'dayjs'

import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'
import Message from '@/components/dashboards/Common/chat/Message'
import MessageContentWrapper from '@/components/dashboards/Common/chat/MessageContentWrapper'
import FreeMessageChatEdit from '@/components/dashboards/student/free-chat/FreeMessageChatEdit'
import RegenerateMessageFreeChat from '@/components/dashboards/student/free-chat/RegenerateMessage'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { createClient } from '@/utils/supabase/server'

import { ClientMessage, Message as MessageType } from './ExamPreparationActions'

export async function continueFreeChatConversation(
    input: string,
    chatId?: string
): Promise<ClientMessage> {
    const aiState = getMutableAIState<typeof FreeChatAI>()

    const supabase = createClient()

    // Update the AI state with the new user message.
    aiState.update({
        chatId: chatId ?? aiState.get().chatId,
        messages: [
            ...aiState.get().messages,
            {
                id: generateId(),
                role: 'user',
                content: input,
            },
        ],
    })

    const result = await streamUI({
        model: google('models/gemini-1.5-flash-latest'),
        messages: [
            ...aiState.get().messages.map((message: any) => ({
                role: message.role,
                content: message.content,
                name: message.name,
            })),
        ],
        temperature: 0.8,
        initial: (
            <Message
                sender={'assistant'}
                time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                isUser={false}
            >
                <ChatLoadingSkeleton />
            </Message>
        ),
        system: 'You are a helpful assistant. Ask me anything!',
        text: async function ({ content, done }) {
            if (done) {
                const aiMessageInsert = await supabase.from('messages').insert({
                    chat_id: chatId ? +chatId : +aiState.get().chatId,
                    message: content,
                    sender: 'assistant',
                    created_at: new Date().toISOString(),
                }).select('id').single()

                aiState.done({
                    ...aiState.get(),
                    messages: [
                        ...aiState.get().messages,
                        {
                            id: aiMessageInsert.data.id.toString(),
                            role: 'assistant',
                            content,
                        },
                    ],
                })
            }

            return (
                <Message
                    sender={'assistant'}
                    time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                    isUser={false}
                >
                    <MessageContentWrapper
                        role="assistant"
                        view={<ViewMarkdown markdown={content} />}
                        edit={
                            <FreeMessageChatEdit
                                sender="assistant"
                                text={content}
                                chatId={
                                    Number(chatId) ??
                                    Number(aiState.get().chatId)
                                }
                            />
                        }
                        regenerate={
                            <RegenerateMessageFreeChat
                                chatId={
                                    Number(chatId) ??
                                    Number(aiState.get().chatId)
                                }
                                message={content}
                            />
                        }
                    />
                </Message>
            )
        },
    })

    return {
        id: generateId(),
        role: 'assistant',
        display: result.value,
    }
}

interface AIState {
    chatId: string
    messages: MessageType[]
}

export type UIState = Array<{
    id: string
    display: React.ReactNode
}>

export const FreeChatAI = createAI<AIState, UIState>({
    actions: {
        continueFreeChatConversation,
    },
    initialUIState: [],
    initialAIState: { chatId: generateId(), messages: [] },
})

export interface Chat extends Record<string, any> {
    id: string
    createdAt: Date
    messages: MessageType[]
}

export const getUIStateFromFreeChatAIState = (aiState: Chat) => {
    return aiState.messages
        .filter((message) => message.role !== 'system')
        .map((message, index) => ({
            id: aiState.id,
            display:
                message.role === 'tool' ? null : message.role === 'user' &&
                  typeof message.content === 'string' ? (
                    <Message
                        sender={message.role}
                        time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                        isUser={true}
                    >
                        <MessageContentWrapper
                            role="user"
                            view={<ViewMarkdown markdown={message.content} />}
                            edit={
                                <FreeMessageChatEdit
                                    sender="user"
                                    text={message.content}
                                    chatId={Number(aiState.id)}
                                />
                            }
                        />
                    </Message>
                ) : message.role === 'assistant' &&
                  typeof message.content === 'string' ? (
                    <Message
                        sender={message.role}
                        time={dayjs().format('dddd, MMMM D, YYYY h:mm A')}
                        isUser={false}
                    >
                        <MessageContentWrapper
                            role="assistant"
                            view={<ViewMarkdown markdown={message.content} />}
                            edit={
                                <FreeMessageChatEdit
                                    sender="assistant"
                                    text={message.content}
                                    chatId={Number(aiState.id)}
                                />
                            }
                            regenerate={
                                <RegenerateMessageFreeChat
                                    chatId={Number(aiState.id)}
                                    message={message.content}
                                />
                            }
                        />
                    </Message>
                ) : null,
        }))
}
