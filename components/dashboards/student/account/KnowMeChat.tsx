'use client'
import { useAIState, useUIState } from 'ai/rsc'
import { useEffect } from 'react'

import { UIState } from '@/actions/dashboard/AI/FreeChatPreparation'
import { KnowMeChatAI } from '@/actions/dashboard/AI/KnowMeActions'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

export default function KnowMeChat() {
    const [conversation] = useUIState<typeof KnowMeChatAI>()
    const [aiState] = useAIState()

    console.log(aiState)

    const {
        scrollRef,
        visibilityRef,
        messagesEndRef,
        isAtBottom,
        isVisible,
        scrollToBottom,
    } = useScrollAnchor()

    useEffect(() => {
        scrollToBottom()
    }, [conversation, scrollToBottom])

    return (
        <div>
            {conversation.length > 0 && (
                <ChatList
                    messages={conversation}
                    messagesEndRef={messagesEndRef}
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
