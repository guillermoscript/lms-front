
// UI Components

import { Message as MessageType, nanoid, ToolInvocation } from 'ai'
import { CheckCircle } from 'lucide-react'
import { Suspense, useState } from 'react'

import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/utils'

const ToolInvocationMessage = ({
    toolInvocations
}: {
    toolInvocations?: ToolInvocation[]
}) => {
    return (
        <>
            {toolInvocations?.map(
                (toolInvocation: ToolInvocation) =>
                    'result' in toolInvocation &&
                    toolInvocation.toolName === 'makeUserAssigmentCompleted' && (
                        <SuccessMessage
                            key={toolInvocation.toolCallId}
                            status={toolInvocation.result.status}
                            message={toolInvocation.result.message}
                        />
                    )
            )}
        </>
    )
}

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
    toolInvocations?: ToolInvocation[]
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
                    <ToolInvocationMessage toolInvocations={toolInvocations} />
                    {/* {isUser && (
                        <div className="flex mt-2 space-x-2 ">
                            <Pen className="cursor-pointer" />
                            <Copy className="cursor-pointer" />
                        </div>
                    )} */}
                </div>
            </div>
        </div>
    )
}

const SuccessMessage = ({
    status,
    message
}: {
    status: string
    message: string
}) => {
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

const ChatWindow = ({ messages, isLoading }: { messages: MessageType[], isLoading: boolean }) => {
    return (
        <div className="flex-1 overflow-y-auto p-4 ">
            {messages.map((msg, index) => {
                if (msg.role === 'system') {
                    return null
                }
                return (
                    <Message
                        key={index}
                        message={msg.content}
                        sender={msg.role}
                        time={msg?.createdAt?.toDateString()}
                        isUser={msg.role === 'user'}
                        toolInvocations={msg.toolInvocations}
                    />
                )
            })}
            {isLoading && (
                <div className="space-y-2 w-full">
                    <Skeleton className="h-6 rounded mr-14" />
                    <div className="grid grid-cols-3 gap-4">
                        <Skeleton className="h-6 rounded col-span-2" />
                        <Skeleton className="h-6 rounded col-span-1" />
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                        <Skeleton className="h-6 rounded col-span-1" />
                        <Skeleton className="h-6 rounded col-span-2" />
                        <Skeleton className="h-6 rounded col-span-1 mr-4" />
                    </div>
                    <Skeleton className="h-6 rounded" />
                </div>
            )}
        </div>
    )
}

const ChatInput = ({
    isLoading,
    stop,
    callbackFunction
}: {
    isLoading: boolean
    stop: () => void
    callbackFunction: (MessageType: MessageType) => void
}) => {
    const [message, setMessage] = useState<string>('')

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault()
                callbackFunction({
                    content: message,
                    role: 'user',
                    createdAt: new Date(),
                    id: nanoid()
                })
                setMessage('')
            }}
            className="py-4 flex gap-2 flex-col w-full"
        >
            <Suspense fallback={
                <Skeleton className="w-full h-12" />
            }
            >

                <ForwardRefEditor
                    className={cn(
                        'flex-1 p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full rich-text markdown-body',
                        isLoading ? 'cursor-not-allowed' : 'cursor-text'
                    )}
                    placeholder="Chat with the AI assistant"
                    markdown={message}
                    onChange={(value) => setMessage(value)}
                />
            </Suspense>
            <input type="hidden" value={message} />
            {isLoading ? (
                <Button type="button" onClick={stop}
                    variant='outline'
                    className="rounded-r-lg"
                >
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

export { ChatInput, ChatWindow, Message, SuccessMessage }
