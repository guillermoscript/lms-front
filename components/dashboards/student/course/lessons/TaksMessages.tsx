'use client'
import { Message as MessageType, nanoid, ToolInvocation } from 'ai'
import { useChat } from 'ai/react'
import { CheckCircle, Copy, Pen } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/utils'
import { createClient } from '@/utils/supabase/client'
import { Tables } from '@/utils/supabase/supabase'

const Message = ({
    message,
    sender,
    time,
    isUser,
    toolInvocations
}: {
    message: string
    sender: string
    time?: string
    isUser: boolean
    toolInvocations?: any[]
}) => {
    if (sender !== 'user' && sender !== 'assistant') {
        return null
    }

    return (
        <div
            className={cn(
                'flex w-full border-b p-1 mb-4',
                isUser ? 'justify-end ' : 'justify-start'
            )}
        >
            <div className="flex items-end w-full">
                {!isUser && (
                    <img
                        src={isUser ? '/asdasd/adad.png' : '/img/favicon.png'}
                        alt="profile"
                        className="max-w-[28px] object-cover rounded-full mr-4"
                    />
                )}

                <div className="flex flex-col w-full px-4 py-2 rounded-lg relative">
                    <div className="font-bold mb-1 capitalize">
                        {sender} <span className="text-xs text-gray-400 ml-2">{time}</span>
                    </div>

                    {!toolInvocations && <ViewMarkdown markdown={message} />}

                    {toolInvocations?.map((toolInvocation: ToolInvocation) => {
                        const toolCallId = toolInvocation.toolCallId

                        // other tools:
                        return 'result' in toolInvocation ? (
                            toolInvocation.toolName === 'makeUserAssigmentCompleted' ? (
                                <>
                                    <SuccessMessage
                                        status={toolInvocation.result.status}
                                        message={toolInvocation.result.message}
                                    />
                                </>
                            ) : null
                        ) : null
                    })}

                    {isUser && (
                        <div className="flex mt-2 space-x-2 ">
                            <Pen className="cursor-pointer" />

                            <Copy className="cursor-pointer" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function SuccessMessage ({
    status,
    message
}: {
    status: string
    message: string
}) {
    return (
        <div className="bg-[#f1f5f9] rounded-2xl p-8 shadow-lg">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="text-4xl font-bold text-[#334155]">
                    <CheckCircle className="h-12 w-12 inline-block mr-2 text-green-500" />
                    {status}
                </div>
                <p className="text-lg text-[#475569]">{message}</p>
            </div>
        </div>
    )
}

const ChatWindow = ({ messages }: { messages: MessageType[] }) => {
    console.log(messages)

    return (
        <div className="flex-1 overflow-y-auto p-4 ">
            {messages.map((msg, index) => {
                if (index === 0) {
                    return null
                }
                return (
                    <>
                        <Message
                            key={index}
                            message={msg.content}
                            sender={msg.role}
                            time={msg?.createdAt.toDateString()}
                            isUser={msg.role === 'user'}
                            toolInvocations={msg.toolInvocations}
                        />
                    </>
                )
            })}
        </div>
    )
}

const ChatInput = ({
    handleSubmit,
    isLoading,
    stop,
    lessonId
}: {
    handleSubmit: (e: any) => void
    input: string
    handleInputChange: (e: any) => void
    isLoading: boolean
    stop: () => void
    lessonId: number
}) => {
    const [message, setMessage] = useState<string>('')

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                handleSubmit({
                    content: message,
                    role: 'user'
                })
                addMessageToDatabase(
                    {
                        content: message,
                        role: 'user'
                    },
                    lessonId
                )
                setMessage('')
            }}
            className="p-4 flex gap-2 flex-col "
        >
            <ForwardRefEditor
                className={cn(
                    'flex-1 p-2 rounded-l-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
                    isLoading ? 'cursor-not-allowed' : 'cursor-text'
                )}
                placeholder="Send a message"
                markdown={message}
                onChange={(value) => setMessage(value)}
            />
            <input type="hidden" value={message} />

            {isLoading ? (
                <Button type="button" onClick={stop} className="rounded-r-lg">
          Stop
                </Button>
            ) : (
                <Button type="submit" className="rounded-r-lg">
          Send
                </Button>
            )}
        </form>
    )
}

async function addMessageToDatabase (message: {
    content: string
    role: string
}, lessonId: number) {
    const supabase = createClient()
    const userData = await supabase.auth.getUser()
    if (userData.error) {
        console.log('Error getting user data', userData.error)
    } else {
        const id = userData.data.user.id
        // add message to the database
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

export default function TaksMessages ({
    systemPrompt,
    lessonId,
    initialMessages,
    isLessonAiTaskCompleted
}: {
    systemPrompt: string
    lessonId: number
    initialMessages: Array<Tables<'lessons_ai_task_messages'>>
    isLessonAiTaskCompleted?: boolean
}) {
    const [show, setShow] = useState<boolean>(!isLessonAiTaskCompleted)
    const { toast } = useToast()
    const {
        messages,
        input,
        handleInputChange,
        stop,
        append,
        isLoading
    } = useChat({
        api: '/api/lessons/chat',
        maxAutomaticRoundtrips: 5,
        body: {
            lessonId
        },
        initialMessages: [
            {
                role: 'assistant',
                content: systemPrompt,
                id: nanoid()
            },
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
        // run client-side tools that are automatically executed:
        async onToolCall ({ toolCall }) {
            if (toolCall.toolName === 'makeUserAssigmentCompleted') {
                setShow(false)
            }
        }
    })

    return (
        <>
            {isLessonAiTaskCompleted && (
                <SuccessMessage
                    status="Lesson Completed"
                    message="Congratulations! You have completed the lesson"
                />
            )}
            <ChatWindow messages={messages} />
            {show && (
                <ChatInput
                    // handleSubmit={handleSubmit}
                    handleSubmit={append}
                    handleInputChange={handleInputChange}
                    input={input}
                    isLoading={isLoading}
                    stop={stop}
                    lessonId={lessonId}
                />
            )}
        </>
    )
}
