'use client'
import { useAIState, useUIState } from 'ai/rsc'
import { useEffect } from 'react'

import { KnowMeChatAI } from '@/actions/dashboard/AI/KnowMeActions'
import useScrollAnchor from '@/utils/hooks/useScrollAnchor'

export default function KnowMeChat() {
    const [conversation] = useUIState<typeof KnowMeChatAI>()
    const [aiState] = useAIState()

    console.log(aiState)

    const {
        scrollRef,
        visibilityRef,
        isAtBottom,
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
                />
            )}
        </div>
    )
}

function ChatList({ messages }) {
    return (
        <div className="relative">
            {messages.map((message, index) => (
                <div key={index} className="flex flex-col gap-2">
                    {message.display}
                </div>
            ))}
            <div className="h-px" />
        </div>
    )
}
