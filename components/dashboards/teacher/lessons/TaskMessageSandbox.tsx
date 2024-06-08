'use client'
import { nanoid } from 'ai'
import { useChat } from 'ai/react'
import { useState } from 'react'

import {
    ChatInput,
    ChatWindow
} from '@/components/dashboards/Common/chat/chat'
import { useToast } from '@/components/ui/use-toast'

// Custom Hook for Chat logic
function useChatLogic (systemPrompt: string) {
    const { toast } = useToast()
    const [isLessonAiTaskCompleted, setIsLessonAiTaskCompleted] = useState<boolean>(false)

    const { messages, input, handleInputChange, stop, append, isLoading } =
    useChat({
        api: '/api/lessons/chat/teacher',
        maxAutomaticRoundtrips: 5,
        initialMessages: [
            { role: 'assistant', content: systemPrompt, id: nanoid() }
        ],
        onError (error) {
            console.log(error)
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive'
            })
        },
        async onToolCall ({ toolCall }) {
            if (toolCall.toolName === 'makeUserAssigmentCompleted') {
                setIsLessonAiTaskCompleted(true)
            }
        }
    })

    return {
        messages,
        input,
        handleInputChange,
        stop,
        append,
        isLoading,
        isLessonAiTaskCompleted
    }
}

// Main Component
export default function TaskMessageSandbox ({
    systemPrompt
}: {
    systemPrompt: string
}) {
    const { messages, stop, append, isLoading, isLessonAiTaskCompleted } = useChatLogic(
        systemPrompt
    )

    return (
        <>
            <div className="flex flex-col gap-4 rounded border p-4 w-full">
                <ChatWindow messages={messages} />
            </div>
            {!isLessonAiTaskCompleted && (
                <ChatInput
                    isLoading={isLoading}
                    stop={stop}
                    callbackFunction={async (message) => {
                        append(message)
                    }}
                />
            )}
        </>
    )
}
