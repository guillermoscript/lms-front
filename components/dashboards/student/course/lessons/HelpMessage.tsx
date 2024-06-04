'use client'
import { ToolInvocation } from 'ai'
import { useChat } from 'ai/react'
import { CheckCircle, Copy, Pen } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ForwardRefEditor } from '@/components/ui/markdown/ForwardRefEditor'
import ViewMarkdown from '@/components/ui/markdown/ViewMarkdown'
import { cn } from '@/utils'

const Message = ({
    message,
    sender,
    time,
    isUser,
    toolInvocations
}: {
    message: string
    sender: string
    time: string
    isUser: boolean
    toolInvocations?: any[]
}) => {
    if (sender !== 'user' && sender !== 'assistant') {
        return null
    }

    console.log(toolInvocations)

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
                        {sender}{' '}
                        <span className="text-xs text-gray-400 ml-2">
                            {time}
                        </span>
                    </div>

                    {!toolInvocations && <ViewMarkdown markdown={message} />}

                    {toolInvocations?.map((toolInvocation: ToolInvocation) => {
                        const toolCallId = toolInvocation.toolCallId

                        // other tools:
                        return 'result' in toolInvocation ? (
                            toolInvocation.toolName ===
                          'makeUserAssigmentCompleted' ? (
                                    <>
                                        {/* <div
                                            key={toolCallId}
                                            className="flex flex-col gap-2 p-4 bg-green-400 rounded-lg"
                                        >
                                            <div className="flex flex-row justify-between items-center">
                                                <div className="text-4xl text-blue-50 font-medium">
                                                    {toolInvocation.result.status}°
                                                </div>

                                                <div className="text-green-50 font-medium">
                                                    {toolInvocation.result.message}
                                                </div>
                                            </div>
                                        </div> */}
                                        <div className="bg-[#f1f5f9] rounded-2xl p-8 shadow-lg">
                                            <div className="flex flex-col items-center justify-center text-center space-y-4">
                                                <div className="text-4xl font-bold text-[#334155]">
                                                    <CheckCircle className="h-12 w-12 inline-block mr-2 text-green-500" />
                                                    {toolInvocation.result.status}
                                                </div>
                                                <p className="text-lg text-[#475569]">
                                                    {toolInvocation.result.message}
                                                </p>
                                            </div>
                                        </div>
                                    </>
                                ) : null
                        ) : null
                    }
                    )}

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

const ChatWindow = ({ messages }: { messages: any[] }) => {
    console.log(messages)

    return (
        <div className="flex-1 overflow-y-auto p-4 ">
            {messages.map((msg, index) => {
                return (
                    <>
                        <Message
                            key={index}
                            message={msg.content}
                            sender={msg.role}
                            time={msg.time}
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
    handleInputChange,
    input,
    isLoading,
    stop
}: {
    handleSubmit: (e: any) => void
    input: string
    handleInputChange: (e: any) => void
    isLoading: boolean
    stop: () => void
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
            }}
            className="p-4 flex gap-2 flex-col "
        >
            <ForwardRefEditor
                className="flex-1 p-2 rounded-l-lg"
                placeholder="Send a message"
                markdown={message}
                onChange={(value) => setMessage(value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit({
                    content: message,
                    role: 'user'
                })
                }
            />
            <input
                type='hidden'
                value={message}
            />

            {isLoading
                ? (
                    <Button type="button" onClick={stop} className="rounded-r-lg">
            Stop
                    </Button>
                )
                : (
                    <Button type="submit" className="rounded-r-lg">
            Send
                    </Button>
                )}
        </form>
    )
}

// export default function HelpMessages () {
//     const [input, setInput] = useState<string>('')
//     const [conversation, setConversation] = useUIState()
//     const { continueConversation } = useActions()
//     const [isLoading, setIsLoading] = useState<boolean>(false)

//     console.log(conversation)

//     const handleSubmit = async (event: React.FormEvent) => {
//         event.preventDefault()

//         setInput('')
//         setIsLoading(true)

//         setConversation((currentConversation: ClientMessage[]) => [
//             ...currentConversation,
//             { id: nanoid(), role: 'user', display: input }
//         ])

//         const message = await continueConversation(input)

//         setConversation((currentConversation: ClientMessage[]) => [
//             ...currentConversation,
//             message
//         ])

//         setIsLoading(false)
//     }

//     return (
//         <>
//             <div className="flex flex-col h-full w-full">
//                 <h4 className="text-lg font-bold mb-4">
//                     Try completing the task and the AI will review it
//                 </h4>
//                 <ChatWindow messages={conversation} />
//                 <ChatInput
//                     handleSubmit={handleSubmit}
//                     handleInputChange={event => setInput(event.target.value)}
//                     input={input}
//                     isLoading={isLoading}
//                     stop={() => setIsLoading(false)}
//                 />
//             </div>

//         </>
//     )
// }

export default function HelpMessages () {
    const [show, setShow] = useState<boolean>(true)

    const { messages, input, handleInputChange, handleSubmit, addToolResult, stop, append } =
    useChat({
        api: '/api/lessons/chat',
        maxAutomaticRoundtrips: 5,

        // run client-side tools that are automatically executed:
        async onToolCall ({ toolCall }) {
            if (toolCall.toolName === 'makeUserAssigmentCompleted') {
                // return
                console.log('toolCall', toolCall)
                setShow(false)
            }
        }
    })

    return (
        <>
            <ChatWindow messages={messages} />

            {show && (

                <ChatInput
                    // handleSubmit={handleSubmit}
                    handleSubmit={append}
                    handleInputChange={handleInputChange}
                    input={input}
                    isLoading={false}
                    stop={stop}
                />
            )}
        </>
    )
}
