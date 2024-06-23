'use client'
import { generateId, Message } from 'ai'
import { useChat } from 'ai/react'
import { useState } from 'react'

import { studentCreateNewChat } from '@/actions/dashboard/chatActions'
import { ChatInput, ChatWindow } from '@/components/dashboards/Common/chat/chat'
import SuggestionsContainer from '@/components/dashboards/Common/chat/SuggestionsContainer'

export default function FreeChat ({
    children,
    chatId,
    initialMessages
}: {
    children?: React.ReactNode
    chatId?: number
    initialMessages?: Message []
}) {
    const [chatIdState, setChatIdState] = useState<number | null>(chatId)
    const { messages, isLoading, stop, append } =
    useChat({
        maxToolRoundtrips: 5,
        initialMessages: initialMessages ?? [
            {
                role: 'system',
                content: 'You are a helpful assistant. Ask me anything!', // initial message
                id: generateId()
            }
        ],
        body: {
            chatId: chatIdState
        }
    })

    return (
        <>
            {messages.length <= 1 && (
                <div className="flex flex-col gap-4">
                    <p className="text-lg">
                        Ask me anything, I'm here to help!
                    </p>

                    {children}
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
                            onSuggestionClick={(suggestion) => {
                                append({
                                    content: suggestion,
                                    role: 'user'
                                })
                            }}
                        />
                    </div>
                </div>
            )}
            <ChatWindow
                isLoading={isLoading}
                messages={messages}
            />
            <ChatInput
                isLoading={isLoading}
                stop={stop}
                callbackFunction={async (message) => {
                    console.log('message', message)
                    if (!chatIdState) {
                        // create a new chat
                        const chat = await studentCreateNewChat({
                            chatType: 'free_chat',
                            title: message.content
                        })

                        if (chat.error) {
                            console.error(chat.error)
                            return
                        }

                        console.log('chat', chat.data)

                        setChatIdState(chat.data.chat_id)
                    }
                    append(message)
                }}
            />
        </>
    )
}
