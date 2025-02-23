'use client'
import { useChat } from '@ai-sdk/react'
import { useState } from 'react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ChatTextArea, SuccessMessage } from '../Common/chat/chat'
import MarkdownEditorTour from '../Common/tour/MarkdownEditorTour'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import ChatMessages from './Chatsv2/ChatMessages'
import MarkdowEditorInput from './Chatsv2/MarkdowEditorInput'

interface FreeChatProps {
    children?: React.ReactNode
    systemPrompt: string
}

export default function ShowCaseChat({ systemPrompt }: FreeChatProps) {
    const [completed, setCompleted] = useState(false)

    const { messages, stop, append, isLoading, reload, setInput, setMessages } = useChat({
        initialMessages: [
            {
                id: '1',
                role: 'system',
                content: systemPrompt,
                createdAt: new Date(),
            },
        ], // Set initial messages if any
        api: '/api/chat/home', // Update API endpoint as needed
        maxSteps: 3, // Set max steps if needed
        onToolCall({ toolCall }) {
            // Handle tool call
            console.log(toolCall)
            if (toolCall.toolName === 'makeUserAssignmentCompleted') {
                setCompleted(true)
            }
        }
    })

    return (
        <div className="h-full relative overflow-auto pt-4">
            <div className="py-4">
                {messages.length > 1 ? (
                    <ChatMessages messages={messages}
                        isLoading={isLoading}
                        reload={reload}
                        disabled={false}
                    />
                ) : (
                    <></>
                )}
                {isLoading && <ChatLoadingSkeleton />}
                <div className="w-full h-px" />
            </div>
            <div className='w-full '>
                {completed ? (
                    <>
                        <SuccessMessage />
                    </>
                ) : (
                    <Tabs defaultValue="simple" className="w-full py-4">
                        <div className="flex gap-4">
                            <TabsList
                                id='tabs-list'
                                className='gap-4'
                            >
                                <TabsTrigger
                                    id='simple-tab'
                                    value="simple"
                                >
                                    Simple
                                </TabsTrigger>
                                <TabsTrigger
                                    id='markdown-tab'
                                    value="markdown"
                                >
                                    Markdown
                                </TabsTrigger>
                            </TabsList>
                            <MarkdownEditorTour />
                        </div>
                        <TabsContent
                            id='markdown-content'
                            value="markdown"
                        >
                            <MarkdowEditorInput
                                isLoading={isLoading}
                                stop={() => stop()}
                                callbackFunction={(message) => {
                                    // handleSendMessage(message.content)
                                    console.log(message)
                                    append(message)
                                }}
                                isTemplatePresent={true}
                            />
                        </TabsContent>
                        <TabsContent
                            id='simple-content'
                            value="simple"
                        >
                            <ChatTextArea
                                isLoading={isLoading}
                                stop={() => stop()}
                                callbackFunction={async (message) => {
                                    // handleSendMessage(message.content)
                                    console.log(message)
                                    append(message)
                                }}
                            />
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    )
}
