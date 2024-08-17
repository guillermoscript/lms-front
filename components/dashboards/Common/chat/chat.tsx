'use client'
import { generateId, Message as MessageType, ToolInvocation } from 'ai'
import { CheckCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import Confetti, { ConfettiRef } from '@/components/magicui/confetti'
import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/utils'

import ChatLoadingSkeleton from '../../chat/ChatLoadingSkeleton'

const ToolInvocationMessage = ({
    toolInvocations,
}: {
    toolInvocations?: ToolInvocation[]
}) => {
    return (
        <>
            {toolInvocations?.map(
                (toolInvocation: ToolInvocation) =>
                    'result' in toolInvocation &&
                    toolInvocation.toolName ===
                        'makeUserAssigmentCompleted' && (
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
    toolInvocations,
    children,
}: {
    message?: string
    sender: string
    time?: string
    isUser: boolean
    toolInvocations?: ToolInvocation[]
    children?: React.ReactNode
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
                <div className="flex flex-col w-full px-1 md:px-4 py-2 rounded-lg relative">
                    {!isUser && (
                        <img
                            src={
                                isUser ? '/asdasd/adad.png' : '/img/favicon.png'
                            }
                            alt="profile"
                            className="max-w-[28px] object-cover rounded-full mr-4"
                        />
                    )}
                    <div className="font-bold mb-1 capitalize">
                        {sender}{' '}
                        <span className="text-xs text-gray-400 ml-2">
                            {time}
                        </span>
                    </div>
                    {!toolInvocations && <ViewMarkdown markdown={message} />}
                    {!toolInvocations && children}
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
    message,
    fire,
}: {
    status: string
    message: string
    fire?: boolean
}) => {
    const confettiRef = useRef<ConfettiRef>(null)

    useEffect(() => {
        if (fire) {
            confettiRef.current?.fire({})
        }
    }, [fire])

    return (
        <div className="bg-[#f1f5f9] relative rounded-2xl p-8 shadow-lg">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
                <div className="text-4xl font-bold text-[#334155]">
                    <CheckCircle className="h-12 w-12 inline-block mr-2 text-green-500" />
                    {status}
                </div>
                <p className="text-lg text-[#475569]">{message}</p>
                {fire && (
                    <Confetti
                        ref={confettiRef}
                        className="absolute left-0 top-0 z-0 size-full"
                    />
                )}
            </div>
        </div>
    )
}

const ChatWindow = ({
    messages,
    isLoading,
}: {
    messages: MessageType[]
    isLoading: boolean
}) => {
    return (
        <div className="flex-1 overflow-y-auto p-1 md:p-2 lg:p-4">
            {messages.map((msg, index) => {
                if (msg.role === 'system') {
                    return null
                }
                if (index === 0) return null
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
            {isLoading && <ChatLoadingSkeleton />}
        </div>
    )
}

const ChatInput = ({
    isLoading,
    stop,
    callbackFunction,
    isTemplatePresent,
    text,
    buttonChildren,
}: {
    isLoading: boolean
    stop?: () => void
    callbackFunction: (MessageType: MessageType) => void
    isTemplatePresent?: boolean
    text?: string
    buttonChildren?: React.ReactNode
}) => {
    const ref = useRef(null)

    return (
        <>
            {isTemplatePresent && (
                <div id="message-templates" className="flex flex-wrap gap-4">
                    <Button
                        variant="outline"
                        id="form-exam-create-template"
                        disabled={isLoading}
                        className="text-wrap disabled:cursor-not-allowed"
                        onClick={() => {
                            ('Template for generating exam form')
                            const message =
                                'Please create an exam form for the topic of **"Your Topic"**\n---\nThe exam form should contain the following sections:\n- Multiple choice questions\n- True or False questions\n- Fill in the blanks\n- Matching questions\nI want it to have a minimum of "X" questions.\nIt should have a level of difficulty of "X".\nThe exam form should be interactive and engaging.\n'
                            ref.current?.setMarkdown(message)
                        }}
                    >
                        Template for generating exam form for a "X" topic
                    </Button>
                    <Button
                        variant="outline"
                        id="exam-suggestions-template"
                        disabled={isLoading}
                        className="text-wrap disabled:cursor-not-allowed"
                        onClick={() => {
                            const message =
                                'Please help me by giving suggestions of possible exams You could generate for the given topic "Your topic"'
                            ref.current?.setMarkdown(message)
                        }}
                    >
                        Template for asking a suggestions of an exam form for a
                        "X" topic
                    </Button>
                </div>
            )}
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    callbackFunction({
                        content: ref.current?.getMarkdown() || '',
                        role: 'user',
                        createdAt: new Date(),
                        id: generateId(),
                    })
                    ref.current?.setMarkdown('')
                }}
                className="py-4 flex gap-2 flex-col w-full"
            >
                <ForwardRefEditor
                    className={cn(
                        'flex-1 p-2 rounded border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full rich-text markdown-body',
                        isLoading ? 'cursor-not-allowed' : 'cursor-text',
                        'editor'
                    )}
                    placeholder="Chat with the AI assistant"
                    markdown={text ?? ''}
                    ref={ref}
                />
                <input type="hidden" value={ref.current?.getMarkdown()} />
                {
                    buttonChildren || (
                        isLoading ? (
                            <Button
                                type="button"
                                onClick={stop}
                                variant="outline"
                                className="rounded-r-lg"
                            >
                                Stop
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                className="rounded-r-lg"
                            >
                                Send
                            </Button>
                        )
                    )
                }
                <DisclaimerForUser />
            </form>
        </>
    )
}

function ChatTextArea({
    isLoading,
    stop,
    callbackFunction,
    text,
    buttonChildren
}: {
    isLoading: boolean
    stop?: () => void
    callbackFunction: (MessageType: MessageType) => void
    text?: string
    buttonChildren?: React.ReactNode
}) {
    const [value, setValue] = useState(text)

    return (
        <>
            <form
                onSubmit={(e) => {
                    e.preventDefault()
                    callbackFunction({
                        // @ts-expect-error
                        content: e.target.textarea.value.trim(),
                        role: 'user',
                        createdAt: new Date(),
                        id: generateId(),
                    })
                    e.currentTarget.reset()
                    setValue('')
                }}
                className="py-4 flex gap-2 flex-col w-full"
            >
                <Textarea
                    placeholder="Type your message here"
                    required
                    className="rounded-l-lg"
                    rows={7}
                    id='textarea'
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                />
                {
                    buttonChildren || (
                        isLoading ? (
                            <Button
                                type="button"
                                onClick={stop}
                                variant="outline"
                                className="rounded-r-lg"
                            >
                                Stop
                            </Button>
                        ) : (
                            <Button
                                type="submit"
                                className="rounded-r-lg"
                            >
                                Send
                            </Button>
                        )
                    )
                }
                <DisclaimerForUser />
            </form>
        </>
    )
}

function DisclaimerForUser() {
    return (
        <div className="flex-1 flex items-center justify-center my-4">
            <p className="text-sm">
                LLMs can make mistakes. Verify important information.
            </p>
        </div>
    )
}

export { ChatInput, ChatTextArea, ChatWindow, DisclaimerForUser, Message, SuccessMessage }
