'use client'
import { nanoid } from 'ai'
import { useChat } from 'ai/react'
import { useState } from 'react'

import { ChatInput, ChatWindow, SuccessMessage } from '@/components/dashboards/Common/chat/chat'
import { useToast } from '@/components/ui/use-toast'
import { createClient } from '@/utils/supabase/client'

// Custom Hook for Chat logic
function useChatLogic (
    systemPrompt,
    lessonId,
    initialMessages,
    isLessonAiTaskCompleted
) {
    const { toast } = useToast()
    const [show, setShow] = useState<boolean>(!isLessonAiTaskCompleted)

    const { messages, input, handleInputChange, stop, append, isLoading } =
    useChat({
        api: '/api/lessons/chat/student',
        maxAutomaticRoundtrips: 5,
        body: { lessonId },
        initialMessages: [
            { role: 'assistant', content: systemPrompt, id: nanoid() },
            ...initialMessages.map((msg) => ({
                role: msg.sender,
                content: msg.message,
                id: nanoid()
            }))
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
                setShow(false)
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
        show,
        setShow
    }
}

// Function to add message to database (can be reused)
async function addMessageToDatabase (message, lessonId) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    if (userData.error) {
        console.log('Error getting user data', userData.error)
    } else {
        const id = userData.data.user.id
        const messageData = await supabase.from('lessons_ai_task_messages').insert({
            user_id: id,
            message: message.content,
            sender: message.role as 'assistant' | 'user',
            lesson_id: lessonId
        })
        if (messageData.error) {
            console.log('Error adding message to the database', messageData.error)
        }
        console.log('Message added to the database', messageData)
    }
}

// Main Component
export default function TaskMessages ({
    systemPrompt,
    lessonId,
    initialMessages,
    isLessonAiTaskCompleted
}: {
    systemPrompt: string
    lessonId: number
    initialMessages: any[]
    isLessonAiTaskCompleted: boolean
}) {
    const { messages, stop, append, isLoading, show } =
    useChatLogic(
        systemPrompt,
        lessonId,
        initialMessages,
        isLessonAiTaskCompleted
    )

    return (
        <>
            {isLessonAiTaskCompleted && (
                <SuccessMessage
                    status='success'
                    message='Assignment marked as completed.'
                />
            )}
            <ChatWindow
                isLoading={isLoading}
                messages={messages}
            />
            {show && (
                <ChatInput
                    isLoading={isLoading}
                    stop={stop}
                    callbackFunction={async (message) => {
                        await addMessageToDatabase(message, lessonId)
                        append(message)
                    }}
                />
            )}
        </>
    )
}
