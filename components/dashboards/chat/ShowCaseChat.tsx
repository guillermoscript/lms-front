'use client'
import { useChat } from 'ai/react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import MarkdownEditorTour from '../Common/tour/MarkdownEditorTour'
import ChatLoadingSkeleton from './ChatLoadingSkeleton'
import ChatMessages from './Chatsv2/ChatMessages'

interface FreeChatProps {
    children?: React.ReactNode
    systemPrompt: string
}

export default function ShowCaseChat({ systemPrompt }: FreeChatProps) {
    const { messages, input, handleInputChange, handleSubmit, isLoading, reload, setInput, setMessages } = useChat({
        initialMessages: [
            {
                id: '1',
                role: 'system',
                content: systemPrompt,
                createdAt: new Date(),
            },
        ], // Set initial messages if any
        api: '/api/chat/home', // Update API endpoint as needed
    })

    return (
        <div className="h-full relative overflow-auto pt-4">
            <div className="pb-[380px] lg:pb-[360px]">
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
            <div className='w-full absolute bottom-0'>
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

                    </TabsContent>
                    <TabsContent
                        id='simple-content'
                        value="simple"
                    >

                    </TabsContent>
                </Tabs>
            </div>
        </div>
    )
}
