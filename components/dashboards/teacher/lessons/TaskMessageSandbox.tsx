'use client'
import { useChat } from '@ai-sdk/react'
import { generateId } from 'ai'
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
        maxSteps: 5,
        initialMessages: [
            { role: 'system', content: systemPrompt, id: generateId() }
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
                <ChatWindow
                    isLoading={isLoading}
                    messages={messages}
                />
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
