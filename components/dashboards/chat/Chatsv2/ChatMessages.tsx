import { Message } from 'ai'
import { useEffect, useRef } from 'react'

import ChatLoadingSkeleton from '@/components/dashboards/chat/ChatLoadingSkeleton'

import { MessageItem } from './MessageItem'

export default function ChatMessages({ messages, isLoading, reload, disabled }: {
    messages: Message[]
    isLoading: boolean
    reload: (message: Message) => void
    disabled: boolean
}) {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    // useEffect(() => {
    //     if (messagesEndRef.current) {
    //         messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    //     }
    // }, [messages, isLoading])

    const filteredMessages = messages.filter(message => message.role !== 'system')

    return (
        <div className="flex-1 overflow-y-auto w-full ">
            {filteredMessages.map(message => (
                <MessageItem
                    reload={reload}
                    isLoading={isLoading}
                    key={message.id} message={message}
                    disabled={disabled}
                />
            ))}
            {isLoading && (
                <ChatLoadingSkeleton />
            )}
            <div ref={messagesEndRef} />
        </div>
    )
}
